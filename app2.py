import os
import tempfile
import fitz  # PyMuPDF
import cv2
import numpy as np
import time
import shutil
import psutil
from pathlib import Path
import concurrent.futures
from functools import partial
from flask import Flask, request, jsonify
import uuid
import threading
import queue
import logging
import signal
from werkzeug.serving import make_server
import gc

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("qr_extractor.log")
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Global variables
system_stats = {
    'cpu_percent': 0,
    'memory_percent': 0,
    'active_workers': 0,
    'processed_pages': 0,
    'total_pages': 0,
    'queued_jobs': 0,
    'active_jobs': 0,
    'completed_jobs': 0
}

# Job queue and worker pool
job_queue = queue.Queue()
MAX_CONCURRENT_JOBS = 2  # Limit concurrent jobs
WORKER_POOL_SIZE = None  # Will be set based on CPU count
MAX_CPU_PERCENT = 85     # Throttle if CPU exceeds this percentage
MAX_MEMORY_PERCENT = 85  # Throttle if memory exceeds this percentage
DEFAULT_TIMEOUT = 300    # Default timeout in seconds (5 minutes)
PAGE_BATCH_SIZE = 10     # Process this many pages at once for large PDFs

# Create a lock for resource management
resource_lock = threading.Lock()

# Track running jobs
active_jobs = {}
job_results = {}

def monitor_system_resources():
    """Periodically update system resource statistics"""
    while True:
        try:
            with resource_lock:
                # Update CPU and memory usage
                system_stats['cpu_percent'] = psutil.cpu_percent()
                system_stats['memory_percent'] = psutil.virtual_memory().percent
                
                # Log current stats
                logger.info(f"System load: {system_stats['cpu_percent']}% CPU / {system_stats['memory_percent']}% memory")
                logger.info(f"Workers: {system_stats['active_workers']} | Jobs: {system_stats['active_jobs']}/{system_stats['queued_jobs']}")
                logger.info(f"Progress: {system_stats['processed_pages']} / {system_stats['total_pages']} " + 
                      f"({(system_stats['processed_pages'] / max(1, system_stats['total_pages']) * 100):.2f}%)")

                # Adjust worker pool size based on system load
                adjust_worker_pool_size()
            
            # Sleep for a bit before updating again
            time.sleep(5)
        except Exception as e:
            logger.error(f"Error monitoring resources: {e}")
            time.sleep(5)

def adjust_worker_pool_size():
    """Dynamically adjust worker pool size based on system load"""
    global WORKER_POOL_SIZE
    
    cpu_cores = os.cpu_count() or 4
    
    # If system is under high load, reduce workers
    if system_stats['cpu_percent'] > MAX_CPU_PERCENT or system_stats['memory_percent'] > MAX_MEMORY_PERCENT:
        new_size = max(1, min(WORKER_POOL_SIZE, WORKER_POOL_SIZE // 2))
        if new_size != WORKER_POOL_SIZE:
            logger.warning(f"High system load detected! Reducing worker pool from {WORKER_POOL_SIZE} to {new_size}")
            WORKER_POOL_SIZE = new_size
    # If system load is low, cautiously increase workers
    elif system_stats['cpu_percent'] < MAX_CPU_PERCENT * 0.7 and system_stats['memory_percent'] < MAX_MEMORY_PERCENT * 0.7:
        # Don't exceed CPU count
        new_size = min(cpu_cores, WORKER_POOL_SIZE + 1)
        if new_size != WORKER_POOL_SIZE:
            logger.info(f"System load is low. Increasing worker pool from {WORKER_POOL_SIZE} to {new_size}")
            WORKER_POOL_SIZE = new_size

def job_processor():
    """Process jobs from the queue"""
    while True:
        try:
            # Get job from queue
            job_id, pdf_path, callback = job_queue.get(block=True)
            
            with resource_lock:
                system_stats['queued_jobs'] -= 1
                system_stats['active_jobs'] += 1
                active_jobs[job_id] = {
                    'start_time': time.time(),
                    'status': 'processing',
                    'pdf_path': pdf_path
                }
            
            logger.info(f"Starting job {job_id} for PDF: {pdf_path}")
            
            try:
                # Process the job with timeout
                result = process_pdf_with_timeout(pdf_path, job_id)
                
                # Store the result
                with resource_lock:
                    job_results[job_id] = {
                        'status': 'completed',
                        'result': result,
                        'completion_time': time.time()
                    }
                    
                # Execute callback if provided
                if callback:
                    try:
                        callback(job_id, result, None)
                    except Exception as e:
                        logger.error(f"Error in callback for job {job_id}: {e}")
                
                logger.info(f"Completed job {job_id} with {len(result)} QR codes found")
                
            except Exception as e:
                error_msg = f"Error processing job {job_id}: {e}"
                logger.error(error_msg)
                
                # Store the error
                with resource_lock:
                    job_results[job_id] = {
                        'status': 'failed',
                        'error': str(e),
                        'completion_time': time.time()
                    }
                
                # Execute callback with error
                if callback:
                    try:
                        callback(job_id, None, error_msg)
                    except Exception as e:
                        logger.error(f"Error in error callback for job {job_id}: {e}")
            
            finally:
                # Always clean up
                with resource_lock:
                    if job_id in active_jobs:
                        del active_jobs[job_id]
                    system_stats['active_jobs'] -= 1
                    system_stats['completed_jobs'] += 1
                
                # Clean up the specific PDF file
                try:
                    if os.path.exists(pdf_path):
                        os.remove(pdf_path)
                except Exception as e:
                    logger.warning(f"Could not remove PDF file {pdf_path}: {e}")
                
                # Mark the job as done in the queue
                job_queue.task_done()
                
                # Force garbage collection
                gc.collect()
        
        except Exception as e:
            logger.error(f"Critical error in job processor: {e}")
            time.sleep(1)  # Avoid tight loop in case of repeated errors

def start_job_processors(num_processors):
    """Start job processor threads"""
    for i in range(num_processors):
        processor = threading.Thread(target=job_processor, daemon=True)
        processor.start()
        logger.info(f"Started job processor {i+1}")

def process_pdf_with_timeout(pdf_path, job_id, timeout=DEFAULT_TIMEOUT):
    """Process PDF with timeout protection"""
    result = []
    
    # Use a queue to get the result from the thread
    result_queue = queue.Queue()
    
    def target():
        try:
            # Process the PDF
            qr_positions = extract_qr_positions_from_pdf(pdf_path, job_id=job_id)
            result_queue.put(('success', qr_positions))
        except Exception as e:
            result_queue.put(('error', str(e)))
    
    # Start processing in a separate thread
    thread = threading.Thread(target=target)
    thread.daemon = True
    thread.start()
    
    # Wait for the result with timeout
    try:
        status, data = result_queue.get(timeout=timeout)
        if status == 'error':
            raise Exception(data)
        return data
    except queue.Empty:
        logger.error(f"Job {job_id} timed out after {timeout} seconds")
        raise Exception(f"Processing timed out after {timeout} seconds")

@app.route('/system_stats', methods=['GET'])
def get_system_stats():
    """API endpoint to get current system statistics"""
    return jsonify(system_stats)

@app.route('/job_status/<job_id>', methods=['GET'])
def get_job_status(job_id):
    """API endpoint to get status of a specific job"""
    # Check if job is active
    if job_id in active_jobs:
        elapsed_time = time.time() - active_jobs[job_id]['start_time']
        return jsonify({
            'status': 'processing',
            'elapsed_seconds': elapsed_time,
            'pdf_path': active_jobs[job_id]['pdf_path']
        })
    
    # Check if job has completed
    if job_id in job_results:
        result = job_results[job_id]
        # For completed jobs, include the result
        if result['status'] == 'completed':
            return jsonify({
                'status': result['status'],
                'qr_count': len(result['result']),
                'result': result['result']
            })
        # For failed jobs, include the error
        else:
            return jsonify({
                'status': result['status'],
                'error': result['error']
            })
    
    # Job not found
    return jsonify({'status': 'not_found'}), 404

@app.route('/extract_qr', methods=['POST'])
def extract_qr():
    """API endpoint to extract QR codes from a PDF"""
    pdf_path = None
    upload_dir = None
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    # Get optional timeout parameter
    try:
        timeout = int(request.form.get('timeout', DEFAULT_TIMEOUT))
    except ValueError:
        timeout = DEFAULT_TIMEOUT
    
    # Check if system is overloaded
    if system_stats['cpu_percent'] > MAX_CPU_PERCENT or system_stats['memory_percent'] > MAX_MEMORY_PERCENT:
        return jsonify({
            'error': 'System is currently overloaded. Please try again later.',
            'cpu': system_stats['cpu_percent'],
            'memory': system_stats['memory_percent']
        }), 503
    
    try:
        # Generate job ID
        job_id = str(uuid.uuid4())
        
        # Create a unique upload directory
        upload_dir = os.path.join(os.getcwd(), "uploads", f"qr_api_{job_id}")
        os.makedirs(upload_dir, exist_ok=True)
        
        # Save the uploaded PDF
        pdf_filename = f"{job_id}_{file.filename}"
        pdf_path = os.path.join(upload_dir, pdf_filename)
        
        file.save(pdf_path)
        
        # Verify the file exists and has content
        if not os.path.exists(pdf_path):
            return jsonify({'error': 'Failed to save uploaded file'}), 500
            
        if os.path.getsize(pdf_path) == 0:
            return jsonify({'error': 'Uploaded file is empty'}), 400
        
        # Check if this should be a synchronous or asynchronous request
        async_mode = request.form.get('async', 'false').lower() == 'true'
        
        if async_mode:
            # Add job to queue
            with resource_lock:
                system_stats['queued_jobs'] += 1
            
            job_queue.put((job_id, pdf_path, None))
            
            return jsonify({
                'job_id': job_id,
                'status': 'queued',
                'message': 'PDF processing has been queued',
                'status_url': f"/job_status/{job_id}"
            })
        else:
            # Process immediately (but still with timeout)
            try:
                result = process_pdf_with_timeout(pdf_path, job_id, timeout)
                
                # Store result for potential later retrieval
                with resource_lock:
                    job_results[job_id] = {
                        'status': 'completed',
                        'result': result,
                        'completion_time': time.time()
                    }
                
                return jsonify({
                    'job_id': job_id,
                    'status': 'completed',
                    'result': result
                })
            except Exception as e:
                logger.error(f"Error in synchronous processing: {e}")
                return jsonify({
                    'job_id': job_id,
                    'status': 'failed',
                    'error': str(e)
                }), 500
            
    except Exception as e:
        logger.error(f"Error setting up PDF processing: {e}")
        return jsonify({'error': f'Error processing PDF: {str(e)}'}), 500
    finally:
        # Clean up in case of immediate failure
        if not async_mode and pdf_path and os.path.exists(pdf_path):
            try:
                os.remove(pdf_path)
            except Exception as cleanup_error:
                logger.warning(f"Could not remove temporary PDF: {cleanup_error}")
                
        if upload_dir and os.path.exists(upload_dir) and not async_mode:
            try:
                shutil.rmtree(upload_dir, ignore_errors=True)
            except Exception as cleanup_error:
                logger.warning(f"Could not remove temporary directory: {cleanup_error}")

def process_page(page_info, temp_dir, qr_detector=None):
    """Process a single PDF page to extract QR codes"""
    page_num, page, page_width, page_height = page_info
    page_results = []
    
    # Create a unique filename for this page
    temp_filename = os.path.join(temp_dir, f"page_{page_num}.png")
    
    try:
        # Make sure temp directory exists
        os.makedirs(temp_dir, exist_ok=True)
        
        # Use a more memory-efficient approach with a lower DPI for initial check
        # Start with a lower resolution for faster processing
        dpi = 150  # Lower DPI uses less memory but might miss small QR codes
        pix = page.get_pixmap(matrix=fitz.Matrix(dpi/72, dpi/72))
        
        # Save the pixmap
        pix.save(temp_filename)
        
        # Explicitly delete the pixmap to free memory
        del pix
        
        # Check if the file was created
        if not os.path.exists(temp_filename) or os.path.getsize(temp_filename) == 0:
            raise Exception(f"Failed to create image file at {temp_filename}")
        
        # Read the image with OpenCV
        img = cv2.imread(temp_filename)
        
        if img is None:
            # Try PIL as fallback
            try:
                from PIL import Image
                pil_img = Image.open(temp_filename)
                img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                del pil_img  # Free memory
            except Exception as pil_err:
                raise Exception(f"Failed to load image: {pil_err}")
        
        # Process at lower resolution first
        # Detect QR codes
        if qr_detector is None:
            qr_detector = cv2.QRCodeDetector()
        
        retval, decoded_info, points, straight_qrcode = qr_detector.detectAndDecodeMulti(img)
        
        # If no QR codes found at low resolution and the image is large enough,
        # try again with higher resolution but only if CPU/memory isn't already stressed
        if not retval and img.shape[0] > 1000 and img.shape[1] > 1000:
            with resource_lock:
                cpu_ok = system_stats['cpu_percent'] < MAX_CPU_PERCENT * 0.8
                mem_ok = system_stats['memory_percent'] < MAX_MEMORY_PERCENT * 0.8
            
            if cpu_ok and mem_ok:
                # Try higher resolution
                logger.info(f"Retrying page {page_num + 1} with higher resolution")
                
                # Free the previous image from memory
                del img
                
                # Remove the low-res temp file
                try:
                    if os.path.exists(temp_filename):
                        os.remove(temp_filename)
                except:
                    pass
                
                # Create a higher resolution image
                dpi = 300  # Higher DPI for better detection
                pix = page.get_pixmap(matrix=fitz.Matrix(dpi/72, dpi/72))
                pix.save(temp_filename)
                del pix  # Free memory
                
                # Load the higher-res image
                img = cv2.imread(temp_filename)
                if img is None:
                    raise Exception("Failed to load higher-resolution image")
                
                # Try detection again
                retval, decoded_info, points, straight_qrcode = qr_detector.detectAndDecodeMulti(img)
        
        if retval:
            # Image dimensions
            img_height, img_width = img.shape[:2]
            
            # Scale factors to convert image coordinates to PDF coordinates
            scale_x = page_width / img_width
            scale_y = page_height / img_height
            
            # Process each QR code found
            for i, qr_points in enumerate(points):
                # Convert to a four-point array if needed
                qr_points = qr_points.astype(int)
                
                # Convert polygon coordinates to PDF coordinates
                pdf_points = [
                    (int(p[0] * scale_x), int(p[1] * scale_y)) for p in qr_points
                ]
                
                # Calculate bounding box in PDF coordinates
                x_values = [p[0] for p in pdf_points]
                y_values = [p[1] for p in pdf_points]
                
                min_x, max_x = min(x_values), max(x_values)
                min_y, max_y = min(y_values), max(y_values)
                
                # Store QR code information
                qr_info = {
                    'page': page_num + 1,  # 1-based page number
                    'polygon': pdf_points,
                    'bbox': {
                        'x1': min_x,
                        'y1': min_y,
                        'x2': max_x,
                        'y2': max_y,
                        'width': max_x - min_x,
                        'height': max_y - min_y
                    },
                    'center': {
                        'x': (min_x + max_x) / 2,
                        'y': (min_y + max_y) / 2
                    },
                    'data': decoded_info[i] if i < len(decoded_info) else "Unable to decode"
                }
                
                page_results.append(qr_info)
        
        # Free memory
        del img
    
    except Exception as e:
        logger.error(f"Error processing page {page_num + 1}: {e}")
        raise
    
    finally:
        # Clean up the temp file
        try:
            if os.path.exists(temp_filename):
                os.remove(temp_filename)
        except Exception as e:
            logger.warning(f"Could not remove temp file {temp_filename}: {e}")
        
        # Force garbage collection to free memory
        gc.collect()
    
    return page_results

def process_page_batch(page_batch, temp_dir, job_id):
    """Process a batch of pages and return combined results"""
    batch_results = []
    qr_detector = cv2.QRCodeDetector()  # Create once and reuse
    
    logger.info(f"Processing batch of {len(page_batch)} pages for job {job_id}")
    
    for page_info in page_batch:
        try:
            # Process page with shared detector
            page_results = process_page(page_info, temp_dir, qr_detector)
            batch_results.extend(page_results)
            
            # Update processed page count
            with resource_lock:
                system_stats['processed_pages'] += 1
                
        except Exception as e:
            logger.error(f"Error in batch processing page {page_info[0] + 1}: {e}")
            # Continue processing other pages despite errors
    
    # Clean up detector to free memory
    del qr_detector
    
    return batch_results

def extract_qr_positions_from_pdf(pdf_path, job_id=None):
    """Extract positions of QR codes from a PDF file"""
    results = []
    
    # Create a temporary directory for this job
    temp_dir = os.path.join(os.getcwd(), "temp", f"qr_extract_{job_id or uuid.uuid4()}")
    try:
        os.makedirs(temp_dir, exist_ok=True)
        logger.info(f"Created temporary directory: {temp_dir}")
    except Exception as e:
        raise Exception(f"Failed to create temporary directory: {e}")
    
    try:
        # Verify file exists
        if not os.path.exists(pdf_path):
            raise Exception(f"PDF file not found at: {pdf_path}")
        
        # Open the PDF file with memory optimization
        try:
            pdf_document = fitz.open(pdf_path)
            num_pages = len(pdf_document)
            logger.info(f"Opened PDF with {num_pages} pages")
            
            # Update global stats
            with resource_lock:
                system_stats['total_pages'] += num_pages
                system_stats['processed_pages'] = 0
        except Exception as e:
            raise Exception(f"Failed to open PDF document: {e}")
        
        # For large PDFs, process in smaller batches to manage memory
        if num_pages > PAGE_BATCH_SIZE:
            logger.info(f"Large PDF detected ({num_pages} pages). Processing in batches of {PAGE_BATCH_SIZE}")
            
            # Process the PDF in batches
            for batch_start in range(0, num_pages, PAGE_BATCH_SIZE):
                batch_end = min(batch_start + PAGE_BATCH_SIZE, num_pages)
                logger.info(f"Processing batch from page {batch_start + 1} to {batch_end}")
                
                # Create page info for this batch
                batch_page_infos = []
                for page_num in range(batch_start, batch_end):
                    page = pdf_document[page_num]
                    batch_page_infos.append((page_num, page, page.rect.width, page.rect.height))
                
                # Dynamically determine worker count based on current system load
                with resource_lock:
                    current_cpu = system_stats['cpu_percent']
                    current_memory = system_stats['memory_percent']
                
                # Adjust worker count based on system load
                if current_cpu > MAX_CPU_PERCENT * 0.8 or current_memory > MAX_MEMORY_PERCENT * 0.8:
                    max_workers = max(1, WORKER_POOL_SIZE // 2)
                else:
                    max_workers = WORKER_POOL_SIZE
                
                with resource_lock:
                    system_stats['active_workers'] = max_workers
                
                # Process batch with adjusted worker count
                with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                    # Split the batch into chunks for parallel processing
                    chunk_size = max(1, len(batch_page_infos) // max_workers)
                    chunks = [batch_page_infos[i:i + chunk_size] for i in range(0, len(batch_page_infos), chunk_size)]
                    
                    # Submit chunks for processing
                    futures = []
                    for chunk in chunks:
                        process_func = partial(process_page_batch, temp_dir=temp_dir, job_id=job_id)
                        futures.append(executor.submit(process_func, chunk))
                    
                    # Collect results from all chunks
                    for future in concurrent.futures.as_completed(futures):
                        try:
                            batch_results = future.result()
                            results.extend(batch_results)
                        except Exception as e:
                            logger.error(f"Error processing batch: {e}")
                
                # Force cleanup between batches
                gc.collect()
                
                # Yield to other processes/threads
                time.sleep(0.1)
        else:
            # For smaller PDFs, process normally
            page_infos = [(page_num, page, page.rect.width, page.rect.height) 
                         for page_num, page in enumerate(pdf_document)]
            
            # Use a reasonable worker count
            max_workers = min(WORKER_POOL_SIZE, num_pages)
            
            with resource_lock:
                system_stats['active_workers'] = max_workers
            
            logger.info(f"Processing {num_pages} pages with {max_workers} workers")
            
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Create a partial function with the temp_dir
                process_func = partial(process_page, temp_dir=temp_dir, qr_detector=None)
                
                # Submit all tasks and collect futures
                future_to_page = {executor.submit(process_func, page_info): page_info[0] 
                                 for page_info in page_infos}
                
                # Process results as they complete
                for future in concurrent.futures.as_completed(future_to_page):
                    page_num = future_to_page[future]
                    try:
                        page_results = future.result()
                        results.extend(page_results)
                        
                        # Update progress
                        with resource_lock:
                            system_stats['processed_pages'] += 1
                            
                    except Exception as e:
                        logger.error(f"Error processing page {page_num + 1}: {e}")
                        # Still count as processed for progress tracking
                        with resource_lock:
                            system_stats['processed_pages'] += 1
        
        # Close the PDF document
        pdf_document.close()
        
        # Reset worker count
        with resource_lock:
            system_stats['active_workers'] = 0
        
        logger.info(f"Completed PDF processing with {len(results)} QR codes found")
        
    except Exception as e:
        logger.error(f"Error extracting QR codes: {e}")
        raise
    finally:
        # Reset stats
        with resource_lock:
            system_stats['active_workers'] = 0
        
        # Clean up the temp directory
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
            logger.info(f"Cleaned up temporary directory: {temp_dir}")
        except Exception as e:
            logger.warning(f"Could not remove temp directory {temp_dir}: {e}")
        
        # Force garbage collection
        gc.collect()
    
    return results

def clean_expired_results():
    """Clean up old job results to prevent memory leaks"""
    while True:
        try:
            current_time = time.time()
            expired_jobs = []
            
            # Find jobs older than 1 hour
            with resource_lock:
                for job_id, job_data in job_results.items():
                    if current_time - job_data.get('completion_time', 0) > 3600:  # 1 hour
                        expired_jobs.append(job_id)
                
                # Remove expired jobs
                for job_id in expired_jobs:
                    if job_id in job_results:
                        del job_results[job_id]
            
            if expired_jobs:
                logger.info(f"Cleaned up {len(expired_jobs)} expired job results")
            
            # Force garbage collection
            gc.collect()
            
            # Sleep for a while
            time.sleep(300)  # Check every 5 minutes
        except Exception as e:
            logger.error(f"Error cleaning expired results: {e}")
            time.sleep(60)

def signal_handler(sig, frame):
    """Handle termination signals gracefully"""
    logger.info("Shutdown signal received, cleaning up...")
    # Perform cleanup
    try:
        # Clean up temp directories
        for dir_name in ['temp', 'uploads']:
            dir_path = os.path.join(os.getcwd(), dir_name)
            if os.path.exists(dir_path):
                shutil.rmtree(dir_path, ignore_errors=True)
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
    
    logger.info("Shutdown complete")
    os._exit(0)

def main():
    global WORKER_POOL_SIZE
    
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Determine number of worker threads
    cpu_count = os.cpu_count() or 4
    WORKER_POOL_SIZE = max(1, min(cpu_count - 1, 4))  # Leave at least 1 CPU free
    
    logger.info(f"Starting QR code extraction service with {WORKER_POOL_SIZE} worker threads")
    
    # Ensure directories exist
    for dir_name in ['temp', 'uploads']:
        dir_path = os.path.join(os.getcwd(), dir_name)
        os.makedirs(dir_path, exist_ok=True)
        logger.info(f"Ensured directory exists: {dir_path}")
    
    # Start system resource monitoring
    monitor_thread = threading.Thread(target=monitor_system_resources, daemon=True)
    monitor_thread.start()
    logger.info("Resource monitoring started")
    
    # Start result cleanup thread
    cleanup_thread = threading.Thread(target=clean_expired_results, daemon=True)
    cleanup_thread.start()
    logger.info("Result cleanup thread started")
    
    # Start job processor threads
    start_job_processors(MAX_CONCURRENT_JOBS)
    
    # Start the Flask app
    logger.info("Starting Flask server on port 3001")
    app.run(host='0.0.0.0', port=3001, threaded=True)

if __name__ == "__main__":
    main()