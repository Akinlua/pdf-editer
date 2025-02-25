from pdf2image import convert_from_path
from pyzbar.pyzbar import decode
from PIL import Image, ImageDraw
import img2pdf
import cv2
import numpy as np

# Step 1: Convert PDF to images
pages = convert_from_path('3M0SA3E-09LK21CT0 3.pdf', 300)

processed_images = []

for page in pages:
    # Convert PIL image to OpenCV format
    cv_img = cv2.cvtColor(np.array(page), cv2.COLOR_RGB2BGR)
    
    # Step 2: Detect QR codes
    decoded_objects = decode(page)
    draw = ImageDraw.Draw(page)

    for obj in decoded_objects:
        (x, y, w, h) = obj.rect
        # Cover QR code with a white rectangle
        draw.rectangle([(x, y), (x + w, y + h)], fill="white")
    
    processed_images.append(page)

# Step 3: Convert images back to PDF
with open("output.pdf", "wb") as f:
    f.write(img2pdf.convert([img.filename for img in processed_images]))
