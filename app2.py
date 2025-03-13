import os
import time
import uuid
import shutil
import psutil
import threading
import cv2
import numpy as np
from flask import Flask, request, jsonify
from pathlib import Path

app = Flask(__name__)

# Global variables to store resource usage
system_stats = {
    'cpu_percent': 0,
    'memory_percent': 0,
    'processed_images': 0,
    'total_images': 0
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
            print(f"== Progress: {system_stats['processed_images']} / {system_stats['total_images']} " + 
                  f"({(system_stats['processed_images'] / max(1, system_stats['total_images']) * 100):.2f}%)")
            
            # Sleep for a bit before updating again
            time.sleep(3)
        except Exception as e:
            print(f"Error monitoring resources: {e}")
            time.sleep(5)  # Longer sleep on error

@app.route('/system_stats', methods=['GET'])
def get_system_stats():
    """API endpoint to get current system statistics"""
    return jsonify(system_stats)

@app.route('/extract_qr', methods=['POST'])
def extract_qr():
    image_path = None
    upload_dir = None
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    try:
        # Create a unique upload directory for this specific request
        request_id = str(uuid.uuid4())
        upload_dir = os.path.join(os.getcwd(), "uploads", f"qr_api_{request_id}")
        os.makedirs(upload_dir, exist_ok=True)
        
        # Save the uploaded image with a unique name
        image_filename = f"{uuid.uuid4()}_{file.filename}"
        image_path = os.path.join(upload_dir, image_filename)
        
        # Save the file
        file.save(image_path)
        
        # Verify the file exists and has content before processing
        if not os.path.exists(image_path):
            return jsonify({'error': 'Failed to save uploaded file'}), 500
            
        if os.path.getsize(image_path) == 0:
            return jsonify({'error': 'Uploaded file is empty'}), 400
            
        print(f"Successfully saved uploaded file: {image_path} (size: {os.path.getsize(image_path)} bytes)")
        
        # Force a small delay to ensure file is fully written to disk
        time.sleep(0.1)
        
        # Process the image to extract QR codes
        start_time = time.time()
        qr_positions = process_image(image_path)
        elapsed_time = time.time() - start_time
        print(f"Found {len(qr_positions)} QR codes in the image in {elapsed_time:.2f} seconds")

        return jsonify(qr_positions)
    
    except Exception as e:
        print(f"Error processing image: {str(e)}")
        return jsonify({'error': f'Error processing image: {str(e)}'}), 500
    
    finally:
        # Clean up the temporary file
        try:
            if image_path and os.path.exists(image_path):
                try:
                    os.chmod(image_path, 0o777)  # Ensure we have permissions
                except:
                    pass  # Ignore if we can't change permissions
                os.remove(image_path)
                
            # Clean up the temp directory we created
            if upload_dir and os.path.exists(upload_dir):
                shutil.rmtree(upload_dir, ignore_errors=True)
        except Exception as cleanup_error:
            print(f"Warning: Could not remove temporary files: {cleanup_error}")

def process_image(image_path):
    """
    Process an image to extract QR codes.
    
    Args:
        image_path (str): Path to the image file
        
    Returns:
        list: List of QR code information dictionaries
    """
    results = []
    
    try:
        # Update global statistics
        system_stats['total_images'] = 1
        system_stats['processed_images'] = 0
        
        # Read the image with OpenCV
        img = cv2.imread(image_path)
        
        if img is None:
            error_msg = f"Failed to load image with OpenCV: {image_path}"
            print(error_msg)
            
            # Try alternative approach with PIL
            try:
                from PIL import Image
                print(f"Attempting to load with PIL: {image_path}")
                pil_img = Image.open(image_path)
                img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                print(f"Successfully loaded image using PIL fallback")
            except Exception as pil_err:
                error_msg = f"PIL fallback also failed: {pil_err}"
                print(error_msg)
                raise Exception(error_msg)
        
        # Check image dimensions
        if img.size == 0:
            error_msg = f"Image has zero size"
            print(error_msg)
            raise Exception(error_msg)
        
        # Get image dimensions
        img_height, img_width = img.shape[:2]
        
        # Initialize QR code detector
        qr_detector = cv2.QRCodeDetector()
        
        # Detect QR codes
        retval, decoded_info, points, straight_qrcode = qr_detector.detectAndDecodeMulti(img)
        
        if retval:
            # Process each QR code found
            for i, qr_points in enumerate(points):
                # Convert to a four-point array if needed
                qr_points = qr_points.astype(int)
                
                # Get x and y values from points
                x_values = [p[0] for p in qr_points]
                y_values = [p[1] for p in qr_points]
                
                min_x, max_x = min(x_values), max(x_values)
                min_y, max_y = min(y_values), max(y_values)
                
                # Store QR code information
                qr_info = {
                    'polygon': qr_points.tolist(),  # Convert numpy array to list
                    'bbox': {
                        'x1': int(min_x),
                        'y1': int(min_y),
                        'x2': int(max_x),
                        'y2': int(max_y),
                        'width': int(max_x - min_x),
                        'height': int(max_y - min_y)
                    },
                    'center': {
                        'x': int((min_x + max_x) / 2),
                        'y': int((min_y + max_y) / 2)
                    },
                    'data': decoded_info[i] if i < len(decoded_info) else "Unable to decode"
                }
                
                results.append(qr_info)
        
        # If no QR codes found, try alternative method
        if not results:
            print("Using alternative detection method...")
            alt_results = process_image_contours(img)
            results.extend(alt_results)
        
        # Update processed count
        system_stats['processed_images'] = 1
        
    except Exception as e:
        error_msg = f"Error processing image: {e}"
        print(error_msg)
        raise Exception(error_msg)
    
    return results

def process_image_contours(img):
    """
    Process an image with contour-based detection for QR codes.
    
    Args:
        img: OpenCV image
        
    Returns:
        list: List of potential QR code information dictionaries
    """
    results = []
    
    try:
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply threshold
        _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
        
        # Find contours
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Image dimensions
        img_height, img_width = img.shape[:2]
        
        # Look for square-like contours (potential QR codes)
        for contour in contours:
            # Get bounding rectangle
            x, y, w, h = cv2.boundingRect(contour)
            
            # QR codes are typically square-ish, calculate aspect ratio
            aspect_ratio = float(w) / h
            
            # Check if it's somewhat square and not too small
            if 0.7 <= aspect_ratio <= 1.3 and w >= 30 and h >= 30:
                qr_info = {
                    'bbox': {
                        'x1': int(x),
                        'y1': int(y),
                        'x2': int(x + w),
                        'y2': int(y + h),
                        'width': int(w),
                        'height': int(h)
                    },
                    'center': {
                        'x': int(x + w/2),
                        'y': int(y + h/2)
                    },
                    'detection_method': 'contour',
                    'confidence': 'low',  # This is just a potential QR code
                    'data': 'Unknown (detected by shape only)'
                }
                
                results.append(qr_info)
    
    except Exception as e:
        print(f"Error in contour processing: {e}")
    
    return results

if __name__ == "__main__":
    # Ensure directories exist
    os.makedirs(os.path.join(os.getcwd(), "uploads"), exist_ok=True)
    
    # Set permissions on directory if possible
    try:
        os.chmod(os.path.join(os.getcwd(), "uploads"), 0o777)
    except:
        print("Warning: Could not set permissions on uploads directory")
    
    # Print initial system stats
    print(f"== Start: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    
    # Start resource monitoring before running the app
    monitor_thread = threading.Thread(target=monitor_system_resources, daemon=True)
    monitor_thread.start()
    print("Resource monitoring started")
    
    app.run(host='0.0.0.0', port=3001)