import os
import tempfile
import fitz  # PyMuPDF
import cv2
import numpy as np
import time
import shutil
import psutil  # Add this to monitor system resources
from pathlib import Path
import concurrent.futures
from functools import partial
from flask import Flask, request, jsonify  # Import Flask and request modules
import uuid  # Import uuid for generating unique filenames
import threading  # For periodic resource monitoring

app = Flask(__name__)  # Create a Flask application

# Global variables to store resource usage
system_stats = {
    'cpu_percent': 0,
    'memory_percent': 0,
    'active_workers': 0,
    'processed_pages': 0,
    'total_pages': 0
}

def monitor_system_resources():
    """Periodically update system resource statistics"""
    while True:
        try:
            # Update CPU and memory usage
            system_stats['cpu_percent'] = psutil.cpu_percent()
            system_stats['memory_percent'] = psutil.virtual_memory().percent
            
            # Print current stats
            print(f"== Sys. load: {system_stats['cpu_percent']}% CPU / {system_stats['memory_percent']}% memory")
            print(f"== Workers: {system_stats['active_workers']}")
            print(f"== Progress: {system_stats['processed_pages']} / {system_stats['total_pages']} " + 
                  f"({(system_stats['processed_pages'] / max(1, system_stats['total_pages']) * 100):.2f}%)")
            
            # Sleep for a bit before updating again
            time.sleep(3)
        except Exception as e:
            print(f"Error monitoring resources: {e}")
            time.sleep(5)  # Longer sleep on error

@app.route('/system_stats', methods=['GET'])
def get_system_stats():
    """API endpoint to get current system statistics"""
    return jsonify(system_stats)

@app.route('/extract_qr', methods=['POST'])  # Define the API endpoint
def extract_qr():
    image_path = None
    
    if 'file' not in request.files:  # Check if a file is part of the request
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']  # Get the file from the request
    if file.filename == '':  # Check if the file has a valid name
        return jsonify({'error': 'No selected file'}), 400
    
    try:
        # Save the uploaded image with a unique name
        image_filename = f"{uuid.uuid4()}_{file.filename}"  # Generate a unique filename
        image_path = os.path.join(os.getcwd(), "uploads", image_filename)  # Save in uploads directory
        
        # Save the uploaded image
        file.save(image_path)
        
        # Verify the file exists and has content before processing
        if not os.path.exists(image_path):
            return jsonify({'error': 'Failed to save uploaded file'}), 500
            
        if os.path.getsize(image_path) == 0:
            return jsonify({'error': 'Uploaded file is empty'}), 400
            
        print(f"Successfully saved uploaded file: {image_path} (size: {os.path.getsize(image_path)} bytes)")
        
        # Read the image with OpenCV
        img = cv2.imread(image_path)
        if img is None:
            return jsonify({'error': 'Failed to load image'}), 500
        
        # Detect QR codes
        qr_detector = cv2.QRCodeDetector()
        retval, decoded_info, points, straight_qrcode = qr_detector.detectAndDecodeMulti(img)
        
        qr_results = []
        if retval:
            for i, qr_points in enumerate(points):
                qr_info = {
                    'data': decoded_info[i] if i < len(decoded_info) else "Unable to decode",
                    'polygon': qr_points.astype(int).tolist()  # Convert to list for JSON serialization
                }
                qr_results.append(qr_info)
        
        return jsonify(qr_results)  # Return the QR positions as JSON
    except Exception as e:
        print(f"Error processing image: {str(e)}")
        return jsonify({'error': f'Error processing image: {str(e)}'}), 500
    finally:
        # Clean up the temporary file with better error handling
        try:
            if image_path and os.path.exists(image_path):
                os.remove(image_path)
        except Exception as cleanup_error:
            print(f"Warning: Could not remove temporary files: {cleanup_error}")

def process_page(page_info, temp_dir, qr_detector=None):
    """
    Process a single PDF page to extract QR codes.
    
    Args:
        page_info (tuple): Tuple containing (page_num, page, page_width, page_height)
        temp_dir (str): Directory to store temporary images
        qr_detector: OpenCV QR code detector
        
    Returns:
        list: List of QR code information dictionaries
    """
    page_num, page, page_width, page_height = page_info
    page_results = []
    
    # Create a unique filename for this page
    temp_filename = os.path.join(temp_dir, f"page_{page_num}.png")
    
    try:
        # First, make sure our temp directory exists
        os.makedirs(temp_dir, exist_ok=True)
        
        # Convert PDF page to an image and save it directly
        # Use a higher resolution (300 DPI) for better QR detection
        pix = page.get_pixmap(matrix=fitz.Matrix(300/72, 300/72))
        
        # Save the pixmap directly to our controlled temp directory
        # Add more debug info
        print(f"Saving page {page_num} image to {temp_filename}")
        pix.save(temp_filename)
        
        # Verify the file was created and has content
        if not os.path.exists(temp_filename):
            error_msg = f"Failed to create image file at {temp_filename}"
            print(error_msg)
            raise Exception(error_msg)
            
        if os.path.getsize(temp_filename) == 0:
            error_msg = f"Created image file is empty at {temp_filename}"
            print(error_msg)
            raise Exception(error_msg)
            
        print(f"Successfully saved image for page {page_num} (size: {os.path.getsize(temp_filename)} bytes)")
        
        # Add a small delay to ensure the file is fully written
        time.sleep(0.1)
        
        # Read the image with OpenCV with explicit error handling
        img = cv2.imread(temp_filename)
        
        if img is None:
            error_msg = f"Failed to load image for page {page_num + 1} with OpenCV"
            print(error_msg)
            
            # Check if file still exists before trying PIL
            if not os.path.exists(temp_filename):
                error_msg = f"Image file disappeared before PIL could read it: {temp_filename}"
                print(error_msg)
                raise Exception(error_msg)
            
            # Try alternative approach with PIL and convert to OpenCV format
            try:
                from PIL import Image
                import numpy as np
                print(f"Attempting to load with PIL: {temp_filename}")
                pil_img = Image.open(temp_filename)
                img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                print(f"Successfully loaded image using PIL fallback for page {page_num + 1}")
            except Exception as pil_err:
                error_msg = f"PIL fallback also failed: {pil_err}"
                print(error_msg)
                raise Exception(error_msg)
        
        # Check image dimensions
        if img.size == 0:
            error_msg = f"Image for page {page_num + 1} has zero size"
            print(error_msg)
            raise Exception(error_msg)
            
        # Convert to grayscale for better QR code detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Initialize detector if not provided
        if qr_detector is None:
            qr_detector = cv2.QRCodeDetector()
        
        # Detect QR codes
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
    
    except Exception as e:
        error_msg = f"Error processing page {page_num + 1}: {e}"
        print(error_msg)
        # Propagate the error by raising it - this helps identify when processing fails
        raise Exception(error_msg)
    
    finally:
        # Try to remove the temp file, but don't crash if we can't
        try:
            if os.path.exists(temp_filename):
                os.chmod(temp_filename, 0o777)  # Ensure we have permissions
                os.remove(temp_filename)
        except Exception as e:
            print(f"Warning: Could not remove temp file {temp_filename}: {e}")
    
    return page_results

def process_page_contours(page_info, temp_dir):
    """
    Process a single PDF page with contour-based detection.
    
    Args:
        page_info (tuple): Tuple containing (page_num, page, page_width, page_height)
        temp_dir (str): Directory to store temporary images
        
    Returns:
        list: List of potential QR code information dictionaries
    """
    page_num, page, page_width, page_height = page_info
    page_results = []
    
    # Create a unique filename for this page
    temp_filename = os.path.join(temp_dir, f"page_{page_num}_contour.png")
    
    try:
        # Convert PDF page to an image
        pix = page.get_pixmap(matrix=fitz.Matrix(200/72, 200/72))
        pix.save(temp_filename)
        
        # Read the image
        img = cv2.imread(temp_filename)
        if img is None:
            return []
            
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply threshold
        _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
        
        # Find contours
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Image dimensions
        img_height, img_width = img.shape[:2]
        
        # Scale factors
        scale_x = page_width / img_width
        scale_y = page_height / img_height
        
        # Look for square-like contours (potential QR codes)
        for contour in contours:
            # Get bounding rectangle
            x, y, w, h = cv2.boundingRect(contour)
            
            # QR codes are typically square-ish, calculate aspect ratio
            aspect_ratio = float(w) / h
            
            # Check if it's somewhat square and not too small
            if 0.7 <= aspect_ratio <= 1.3 and w >= 30 and h >= 30:
                # Convert to PDF coordinates
                pdf_x1 = int(x * scale_x)
                pdf_y1 = int(y * scale_y)
                pdf_x2 = int((x + w) * scale_x)
                pdf_y2 = int((y + h) * scale_y)
                
                qr_info = {
                    'page': page_num + 1,
                    'bbox': {
                        'x1': pdf_x1,
                        'y1': pdf_y1,
                        'x2': pdf_x2,
                        'y2': pdf_y2,
                        'width': pdf_x2 - pdf_x1,
                        'height': pdf_y2 - pdf_y1
                    },
                    'center': {
                        'x': (pdf_x1 + pdf_x2) / 2,
                        'y': (pdf_y1 + pdf_y2) / 2
                    },
                    'detection_method': 'contour',
                    'confidence': 'low'  # This is just a potential QR code
                }
                
                page_results.append(qr_info)
    
    except Exception as e:
        print(f"Error in contour processing for page {page_num + 1}: {e}")
    
    finally:
        # Clean up temp file
        try:
            if os.path.exists(temp_filename):
                os.remove(temp_filename)
        except:
            pass
    
    return page_results

def extract_qr_positions_from_pdf(pdf_path, max_workers=None):
    """
    Extract positions of QR codes from a PDF file using OpenCV in parallel.
    
    Args:
        pdf_path (str): Path to the PDF file
        max_workers (int, optional): Maximum number of worker threads
        
    Returns:
        list: List of dictionaries containing page number and position information
              for each QR code found
    """
    results = []
    errors = []
    
    # Create a temporary directory with a unique request-specific ID
    request_id = str(uuid.uuid4())
    temp_dir = os.path.join(os.getcwd(), "temp", f"qr_extract_{request_id}")
    try:
        os.makedirs(temp_dir, exist_ok=True)
        print(f"Created temporary directory: {temp_dir}")
    except Exception as e:
        error_msg = f"Failed to create temporary directory: {e}"
        print(error_msg)
        raise Exception(error_msg)
    
    try:
        # Verify file exists before opening
        if not os.path.exists(pdf_path):
            error_msg = f"PDF file not found at: {pdf_path}"
            print(error_msg)
            raise Exception(error_msg)
            
        # Open the PDF file
        try:
            pdf_document = fitz.open(pdf_path)
            print(f"Successfully opened PDF with {len(pdf_document)} pages")
            
            # Update global page count for progress monitoring
            system_stats['total_pages'] = len(pdf_document)
            system_stats['processed_pages'] = 0
        except Exception as e:
            error_msg = f"Failed to open PDF document: {e}"
            print(error_msg)
            raise Exception(error_msg)
        
        # Prepare page information for parallel processing
        page_infos = [(page_num, page, page.rect.width, page.rect.height) 
                     for page_num, page in enumerate(pdf_document)]
        
        # Create QR detector to share among workers
        qr_detector = cv2.QRCodeDetector()
        
        # Process pages in parallel - limit max workers to avoid too many concurrent file operations
        if max_workers is None:
            max_workers = min(os.cpu_count() or 4, 4)  # Limit to max 4 workers
            
        # Update worker count in global stats
        system_stats['active_workers'] = max_workers
            
        print(f"Processing PDF with {max_workers} worker threads")
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Create a partial function with the temp_dir and detector
            process_func = partial(process_page_with_stats, temp_dir=temp_dir, qr_detector=qr_detector)
            
            # Submit all tasks and collect futures
            future_to_page = {executor.submit(process_func, page_info): page_info[0] 
                             for page_info in page_infos}
            
            # Process results as they complete
            for future in concurrent.futures.as_completed(future_to_page):
                page_num = future_to_page[future]
                try:
                    page_results = future.result()
                    results.extend(page_results)
                    # Update processed pages count for progress reporting
                    system_stats['processed_pages'] += 1
                except Exception as e:
                    error_msg = f"Error processing page {page_num + 1}: {e}"
                    print(error_msg)
                    errors.append(error_msg)
                    # Still count as processed for progress
                    system_stats['processed_pages'] += 1
        
        # Reset worker count when done
        system_stats['active_workers'] = 0
        
        # Close the PDF document
        pdf_document.close()
        
        # If we have errors and no results, raise an exception
        if len(errors) > 0:
            raise Exception(f"Failed to extract QR codes: {'; '.join(errors)}")
        
    except Exception as e:
        error_msg = f"Error extracting QR codes from PDF: {e}"
        print(error_msg)
        raise Exception(error_msg)
    finally:
        # Reset stats when done
        system_stats['active_workers'] = 0
        system_stats['total_pages'] = 0
        system_stats['processed_pages'] = 0
        
        # Clean up the temp directory at the end, with error handling
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
            print(f"Cleaned up temporary directory: {temp_dir}")
        except Exception as e:
            print(f"Warning: Could not remove temp directory {temp_dir}: {e}")
    
    return results

def process_page_with_stats(page_info, temp_dir, qr_detector=None):
    """Wrapper around process_page that updates system stats"""
    worker_id = threading.get_ident()
    print(f"  #{worker_id % 100} WORK PROCESSING PAGE {page_info[0] + 1}")
    
    return process_page(page_info, temp_dir, qr_detector)

def extract_qr_with_contours(pdf_path, max_workers=None):
    """
    Alternative approach to detect potential QR code positions using contour detection in parallel.
    This might help when regular QR code detection fails.
    """
    results = []
    errors = []
    
    # Create a temporary directory in the application's root folder instead of system temp
    temp_dir = os.path.join(os.getcwd(), "temp", f"qr_extract_alt_{int(time.time())}")
    try:
        os.makedirs(temp_dir, exist_ok=True)
        print(f"Created alternative method temporary directory: {temp_dir}")
    except Exception as e:
        error_msg = f"Failed to create temporary directory for alternative method: {e}"
        print(error_msg)
        raise Exception(error_msg)
    
    try:
        # Open the PDF file
        try:
            pdf_document = fitz.open(pdf_path)
        except Exception as e:
            error_msg = f"Failed to open PDF document for contour detection: {e}"
            print(error_msg)
            raise Exception(error_msg)
        
        # Prepare page information
        page_infos = [(page_num, page, page.rect.width, page.rect.height) 
                     for page_num, page in enumerate(pdf_document)]
        
        # Process pages in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Create a partial function with the temp_dir
            process_func = partial(process_page_contours, temp_dir=temp_dir)
            
            # Submit all tasks and collect futures
            future_to_page = {executor.submit(process_func, page_info): page_info[0] 
                             for page_info in page_infos}
            
            # Process results as they complete
            all_potential_qrs = []
            for future in concurrent.futures.as_completed(future_to_page):
                page_num = future_to_page[future]
                try:
                    page_qrs = future.result()
                    all_potential_qrs.append(page_qrs)
                except Exception as e:
                    error_msg = f"Error in contour processing for page {page_num + 1}: {e}"
                    print(error_msg)
                    errors.append(error_msg)
            
            # Flatten the list of lists
            potential_qrs = [qr for page_qrs in all_potential_qrs for qr in page_qrs]
            
            # Filter out overlapping detections
            for qr in potential_qrs:
                # Check if this QR code overlaps with any we've already found
                overlap = False
                for existing in results:
                    if existing['page'] == qr['page']:
                        # Extract bbox coordinates
                        ex1, ey1 = existing['bbox']['x1'], existing['bbox']['y1']
                        ex2, ey2 = existing['bbox']['x2'], existing['bbox']['y2']
                        qx1, qy1 = qr['bbox']['x1'], qr['bbox']['y1']
                        qx2, qy2 = qr['bbox']['x2'], qr['bbox']['y2']
                        
                        # Calculate overlap
                        overlap_x = max(0, min(qx2, ex2) - max(qx1, ex1))
                        overlap_y = max(0, min(qy2, ey2) - max(qy1, ey1))
                        overlap_area = overlap_x * overlap_y
                        
                        # Calculate areas
                        qr_area = qr['bbox']['width'] * qr['bbox']['height']
                        existing_area = existing['bbox']['width'] * existing['bbox']['height']
                        
                        # Check if significant overlap
                        if overlap_area > 0.5 * min(qr_area, existing_area):
                            overlap = True
                            break
                
                if not overlap:
                    results.append(qr)
        
        pdf_document.close()
        
        # If we have errors and no results, raise an exception
        if len(errors) > 0:
            raise Exception(f"Contour detection failed: {'; '.join(errors)}")
        
    except Exception as e:
        error_msg = f"Error in contour-based QR extraction: {e}"
        print(error_msg)
        raise Exception(error_msg)
    finally:
        # Clean up with better error handling
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
            print(f"Cleaned up alternative method temporary directory: {temp_dir}")
        except Exception as e:
            print(f"Warning: Could not remove temp directory {temp_dir}: {e}")
    
    return results

def main():
    # Example usage
    pdf_path = "./3M0SA3E-09LK21CT0 16.pdf"
    
    # Determine number of worker threads (CPU count is often a good default)
    import multiprocessing
    max_workers = multiprocessing.cpu_count()
    # max_workers = 10
    print(f"Using {max_workers} worker threads")
    
    start_time = time.time()
    
    try:
        # Try standard QR detection first
        qr_positions = extract_qr_positions_from_pdf(pdf_path, max_workers=max_workers)
        
        # If no QR codes found or very few, try alternative approach
        if len(qr_positions) < 1:
            print("Using alternative detection method...")
            try:
                alt_positions = extract_qr_with_contours(pdf_path, max_workers=max_workers)
                
                # Combine results
                seen_positions = set()
                for qr in qr_positions:
                    # Create a simple key based on page and center coordinates
                    key = (qr['page'], round(qr['center']['x']), round(qr['center']['y']))
                    seen_positions.add(key)
                
                # Add non-duplicate positions from alternative method
                for qr in alt_positions:
                    key = (qr['page'], round(qr['center']['x']), round(qr['center']['y']))
                    if key not in seen_positions:
                        qr_positions.append(qr)
            except Exception as e:
                print(f"Alternative detection also failed: {e}")
        
        elapsed_time = time.time() - start_time
        
        # Print the results
        print(f"Found {len(qr_positions)} QR codes in the PDF in {elapsed_time:.2f} seconds")
        
        if len(qr_positions) == 0:
            print("ERROR: No QR codes found in the PDF")
            return
            
        for i, qr in enumerate(qr_positions):
            print(f"\nQR Code #{i+1}:")
            print(f"  Page: {qr['page']}")
            print(f"  Position (bbox): {qr['bbox']}")
            print(f"  Center point: ({qr['center']['x']}, {qr['center']['y']})")
            if 'data' in qr:
                print(f"  Data: {qr['data']}")
            if 'detection_method' in qr:
                print(f"  Detection method: {qr['detection_method']} (confidence: {qr['confidence']})")
    except Exception as e:
        print(f"ERROR: Failed to process PDF: {e}")

if __name__ == "__main__":
    # Ensure temp directories exist
    os.makedirs(os.path.join(os.getcwd(), "temp"), exist_ok=True)
    os.makedirs(os.path.join(os.getcwd(), "uploads"), exist_ok=True)
    
    # Set permissions on directories if possible
    try:
        os.chmod(os.path.join(os.getcwd(), "temp"), 0o777)
        os.chmod(os.path.join(os.getcwd(), "uploads"), 0o777)
    except:
        print("Warning: Could not set permissions on temp directories")
    
    # Print initial system stats
    print(f"== Start: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Start resource monitoring before running the app
    monitor_thread = threading.Thread(target=monitor_system_resources, daemon=True)
    monitor_thread.start()
    print("Resource monitoring started")
    
    app.run(host='0.0.0.0', port=3001)  # Run the Flask app