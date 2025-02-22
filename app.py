import fitz  # PyMuPDF
import os
import re
from PIL import Image
import io

class PDFProcessor:
    def __init__(self, input_folder, output_folder, cover_image_path):
        self.input_folder = input_folder
        self.output_folder = output_folder
        self.cover_image_path = cover_image_path
        
        # Create output folder if it doesn't exist
        if not os.path.exists(output_folder):
            os.makedirs(output_folder)

    def extract_product_name(self, filename):
        # Extract product name pattern (adjust regex as needed)
        match = re.search(r'([A-Z0-9-]+)', filename)
        if match:
            return match.group(1)
        return filename.split('.')[0]

    def remove_sensitive_info(self, page):
        # List of patterns to remove (based on your images)
        patterns = [
            r'www\.omegamotor\.com\.tr',
            r'info@omegamotor\.com\.tr',
            r'\+90\s*216\s*266\s*32\s*80',
            r'\+90\s*216\s*266\s*32\s*89',
            r'Dudullu Organize Sanayi Bölgesi.*Istanbul',
            # Add more patterns as needed
        ]
        
        for pattern in patterns:
            # First try with regular search
            areas = page.search_for(pattern, flags=re.IGNORECASE)
            
            # Then try with text extraction to catch more instances
            text_instances = page.get_text("text")
            matches = re.finditer(pattern, text_instances, re.IGNORECASE)
            
            for rect in areas:
                # Make rectangle slightly larger to ensure complete coverage
                rect.x0 -= 1
                rect.y0 -= 1
                rect.x1 += 1
                rect.y1 += 1
                
                # First erase the content
                page.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1))
                
                # Then add an opaque white rectangle on top
                annot = page.add_rect_annot(rect)
                annot.set_colors(stroke=(1, 1, 1), fill=(1, 1, 1))
                annot.update()

            # Handle any additional matches found in text extraction
            for match in matches:
                # Create a rectangle around the matched text
                text_rect = fitz.Rect(page.search_for(match.group(0))[0])
                if text_rect:
                    page.draw_rect(text_rect, color=(1, 1, 1), fill=(1, 1, 1))
                    annot = page.add_rect_annot(text_rect)
                    annot.set_colors(stroke=(1, 1, 1), fill=(1, 1, 1))
                    annot.update()

    def add_cover_page(self, doc):
        # Create a new first page
        doc.insert_page(0)
        first_page = doc[0]
        
        # Open and read the PNG image
        img = Image.open(self.cover_image_path)
        
        # Convert PNG to bytes
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes = img_bytes.getvalue()
        
        # Insert the image into the PDF
        rect = first_page.rect  # Get page dimensions
        first_page.insert_image(rect, stream=img_bytes)
        
        return doc

    def process_pdfs(self):
        # Get list of PDF files
        pdf_files = [f for f in os.listdir(self.input_folder) if f.endswith('.pdf')]
        
        # Group files by product name
        product_groups = {}
        for pdf_file in pdf_files:
            product_name = self.extract_product_name(pdf_file)
            print(product_name)
            if product_name not in product_groups:
                product_groups[product_name] = []
            product_groups[product_name].append(pdf_file)

        # Process each group
        for product_name, files in product_groups.items():
            for index, pdf_file in enumerate(files, 1):
                input_path = os.path.join(self.input_folder, pdf_file)
                output_filename = f"{product_name} {index}.pdf"
                output_path = os.path.join(self.output_folder, output_filename)

                # Open PDF
                doc = fitz.open(input_path)

                # Add cover page
                doc = self.add_cover_page(doc)

                # Process each page
                for page_num in range(1, doc.page_count):  # Skip cover page
                    page = doc[page_num]
                    self.remove_sensitive_info(page)

                # Save modified PDF
                doc.save(output_path)
                doc.close()
                print(f"Processed: {output_filename}")

# Usage example
processor = PDFProcessor(
    input_folder="input_pdfs",
    output_folder="output_pdfs",
    cover_image_path="cover_page.png"
)
processor.process_pdfs()
