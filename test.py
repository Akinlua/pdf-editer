import fitz  # PyMuPDF
import pytesseract
from PIL import Image, ImageDraw
import io

# Ensure Tesseract is installed: sudo apt install tesseract-ocr (Linux) or download for Windows
# Set Tesseract path if needed (Windows example)
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

def modify_pdf(input_pdf, output_pdf, logo_path):
    doc = fitz.open(input_pdf)
    sensitive_texts = ["TECHNICAL DATASHEET", "OMEGA"]  # Add more patterns to detect

    for page_number in range(len(doc)):
        page = doc[page_number]

        # Handle Searchable Text Redaction
        for text in sensitive_texts:
            areas = page.search_for(text)
            if areas:
                print(f"Found '{text}' at: {areas}")
                for area in areas:
                    page.add_redact_annot(area, fill=(1, 1, 1))  # White fill
                page.apply_redactions()

        # Convert page to image for OCR processing
        img = page.get_pixmap()
        img_pil = Image.open(io.BytesIO(img.tobytes("ppm")))

        # Extract text from image using OCR
        extracted_text = pytesseract.image_to_string(img_pil)
        print(f"OCR Extracted Text: {extracted_text}")

        # If sensitive text is found in OCR result, blur or remove it
        for text in sensitive_texts:
            if text in extracted_text:
                print(f"OCR found '{text}' on page {page_number + 1}, applying image redaction...")
                img_pil = img_pil.convert("L")  # Convert to grayscale for better processing
                draw = ImageDraw.Draw(img_pil)
                width, height = img_pil.size
                draw.rectangle([(50, height - 100), (width - 50, height - 50)], fill="white")  # Hide bottom watermark

                # Replace the original image in the PDF
                img_bytes = io.BytesIO()
                img_pil.save(img_bytes, format="PNG")
                img_bytes = img_bytes.getvalue()

                rect = fitz.Rect(0, 0, img.width, img.height)
                page.insert_image(rect, stream=img_bytes)

    # Add logo to the first page
    first_page = doc[0]
    logo_rect = fitz.Rect(50, 700, 250, 800)
    first_page.insert_image(logo_rect, filename=logo_path)

    doc.save(output_pdf)
    print(f"Modified PDF saved as {output_pdf}")

modify_pdf("input_pdfs/3M0SA3E-09LK21CT0 2.pdf", "output_pdfs/3M0SA3E-09LK21CT0 2.pdf", "cover_page.png")
