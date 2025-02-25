import cv2
import numpy as np
import img2pdf
from pdf2image import convert_from_path
from pyzbar.pyzbar import decode
from PIL import Image

# PDF Input/Output Paths
input_pdf = "input_pdf/3M0SA3E-09LK21CT0 3.pdf"
output_pdf = "output.pdf"

# Convert PDF to Images
images = convert_from_path(input_pdf)

processed_images = []

for img in images:
    # Convert PIL image to OpenCV format
    img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    
    # Detect QR codes
    qr_codes = decode(img_cv)

    for qr in qr_codes:
        # Get QR code coordinates
        x, y, w, h = qr.rect
        
        # Draw a white rectangle over QR Code (to remove it)
        cv2.rectangle(img_cv, (x, y), (x + w, y + h), (255, 255, 255), -1)

    # Convert back to PIL format
    processed_images.append(Image.fromarray(cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB)))

# Save as new PDF
processed_images[0].save(output_pdf, save_all=True, append_images=processed_images[1:])

print("✅ QR codes removed, new PDF saved as:", output_pdf)
