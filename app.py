import os
import tempfile
import fitz  # PyMuPDF
import cv2
import numpy as np
from pyzbar.pyzbar import decode

def extract_qr_positions_from_pdf(pdf_path):
    """
    Extract positions and contents of QR codes from a PDF file.
    
    Args:
        pdf_path (str): Path to the PDF file
        
    Returns:
        list: List of dictionaries containing page number, position information,
              and decoded content for each QR code found
    """
    
    # Results list to store all QR code positions and data
    results = []
    
    # Open the PDF file
    pdf_document = fitz.open(pdf_path)
    
    # Process each page in the PDF
    for page_num, page in enumerate(pdf_document):
        # Convert PDF page to an image
        # Higher dpi values increase resolution but processing time
        pix = page.get_pixmap(matrix=fitz.Matrix(300/72, 300/72))
        
        # Create a temporary file to store the image
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as temp_file:
            temp_filename = temp_file.name
            pix.save(temp_filename)
        
        # Read the image with OpenCV
        img = cv2.imread(temp_filename)
        
        # Delete the temporary file
        os.unlink(temp_filename)
        
        if img is None:
            print(f"Failed to load image for page {page_num + 1}")
            continue
            
        # Convert to grayscale for better QR code detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Optional: Apply threshold to improve QR detection
        # _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
        
        # Detect QR codes in the image
        qr_codes = decode(gray)
        
        # Get page dimensions
        page_width = page.rect.width
        page_height = page.rect.height
        
        # Image dimensions
        img_height, img_width = gray.shape
        
        # Scale factors to convert image coordinates to PDF coordinates
        scale_x = page_width / img_width
        scale_y = page_height / img_height
        
        # Process each QR code found
        for qr in qr_codes:
            # Get the polygon points of the QR code (corners)
            points = qr.polygon
            
            if points and len(points) >= 4:
                # Convert polygon coordinates to PDF coordinates
                pdf_points = [
                    (int(p.x * scale_x), int(p.y * scale_y)) for p in points
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
                    'data': qr.data.decode('utf-8')
                }
                
                results.append(qr_info)
    
    # Close the PDF document
    pdf_document.close()
    
    return results

def main():
    # Example usage
    pdf_path = "./3M0SA3E-09LK21CT0 16.pdf"
    qr_positions = extract_qr_positions_from_pdf(pdf_path)
    
    # Print the results
    print(f"Found {len(qr_positions)} QR codes in the PDF")
    for i, qr in enumerate(qr_positions):
        print(f"\nQR Code #{i+1}:")
        print(f"  Page: {qr['page']}")
        print(f"  Position (bbox): {qr['bbox']}")
        print(f"  Center point: ({qr['center']['x']}, {qr['center']['y']})")
        print(f"  Data: {qr['data']}")

if __name__ == "__main__":
    main()