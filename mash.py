import csv
import time
import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import re

options = Options()
options.add_argument("--headless")
options.add_argument("--disable-gpu")
options.add_argument("--no-sandbox")
driver = webdriver.Chrome(options=options)


import os

def download_image(image_url, folder="images"):
    """Downloads the image from the given URL and saves it to a folder with its original filename."""
    if not image_url:
        return None

    # Ensure the folder exists
    os.makedirs(folder, exist_ok=True)

    # Extract the filename (after /uploads/YYYY/MM/)
    filename = image_url.split("/")[-1]
    filepath = os.path.join(folder, filename)

    try:
        response = requests.get(image_url, stream=True)
        if response.status_code == 200:
            with open(filepath, "wb") as file:
                for chunk in response.iter_content(1024):
                    file.write(chunk)
            print(f"Downloaded: {filename}")
            return filename
        else:
            print(f"Failed to download: {image_url}")
            return None
    except Exception as e:
        print(f"Error downloading {image_url}: {e}")
        return None


def get_sitemap_urls(sitemap_url):
    response = requests.get(sitemap_url)
    soup = BeautifulSoup(response.content, "xml")
    return [loc.text for loc in soup.find_all("loc")]

products_sitemap_url = "https://www.mash-mahatz.co.il/products-sitemap.xml"
product_urls_ = get_sitemap_urls(products_sitemap_url)
product_urls = product_urls_[1:]
print(len(product_urls))

products_data = []
for url in product_urls:
    driver.get(url)
    try:
        title_elem = driver.find_element(By.CSS_SELECTOR, "span.breadcrumb_last strong")
        title = title_elem.text.strip()
    except Exception:
        title = ""    
    try:
        brand_elem = driver.find_element(By.CSS_SELECTOR, "div.elementor-element.elementor-element-14b7d4c.elementor-widget__width-initial.elementor-widget.elementor-widget-text-editor div.elementor-widget-container")
        brand = brand_elem.text.strip()
    except Exception:
        brand = ""
    try:
        desc_elem = driver.find_element(By.CSS_SELECTOR, "div.elementor-element.elementor-element-5e5037f.elementor-widget.elementor-widget-text-editor div.elementor-widget-container")
        description = desc_elem.get_attribute("outerHTML").replace('\n', ' ').replace('\r', ' ')
    except Exception:
        description = ""
    try:
        details_elem = driver.find_element(By.CSS_SELECTOR, "div.elementor-element.elementor-element-f50c3f6.elementor-widget.elementor-widget-text-editor div.elementor-widget-container")
        details = details_elem.get_attribute("outerHTML")
    except Exception:
        details = ""
    
    # try:
    #     page_html = driver.page_source
    #     soup = BeautifulSoup(page_html, "html.parser")
    #     link_tag = soup.find("link", {"rel": "preload", "data-rocket-preload": True, "as": "image"})
    #     img = link_tag["href"] if link_tag and link_tag.has_attr("href") else ""
    # except Exception:
    #     img = ""

    try:
        page_html = driver.page_source
        soup = BeautifulSoup(page_html, "html.parser")

        # Try getting the preload image first
        link_tag = soup.find("link", {"rel": "preload", "data-rocket-preload": True, "as": "image"})
        if link_tag and link_tag.has_attr("href"):
            img = link_tag["href"]
        else:
            # If the preload link is not available, extract the image from style tag
            style_tag = soup.find("style", id="wpr-usedcss")
            if style_tag:
                match = re.search(r'background-image:url\("([^"]+)"\)', style_tag.text)
                img = match.group(1) if match else ""
            else:
                img = ""

    except Exception:
        img = ""

    print(f"image here {img}")  # Debugging


    # print(f'Gotten for${url} - ${title} - ${brand}- ${description}- ${details} - ${img}  now')
    print(f'Gotten for ${url} now')

    # Download the image and get the saved filename
    image_filename = download_image(img)

    # Append data to the list
    products_data.append({
        "TITLE": title,
        "BRAND": brand,
        "DESCRIPTION": description,
        "DETAILS": details,
        "IMG": image_filename,  # Store only the filename, not the full URL
        "URL": url
    })

product_types_sitemap_url = "https://www.mash-mahatz.co.il/product_types-sitemap.xml"
category_urls = get_sitemap_urls(product_types_sitemap_url)

product_category_map = {}

for cat_url in category_urls:
    driver.get(cat_url)
   
    category = driver.find_element(By.CSS_SELECTOR, "div.elementor-element.elementor-element-910f92b.elementor-widget.elementor-widget-theme-archive-title.elementor-page-title.elementor-widget-heading div.elementor-widget-container h1.elementor-heading-title.elementor-size-default")
    category_name = category.text.strip()
    # print(f'Category checks - ${category_name}')
    
    try:
        product_elements = driver.find_elements(By.CSS_SELECTOR, "div.elementor-element.elementor-element-1cb3dcc.elementor-widget.elementor-widget-heading h2.elementor-heading-title.elementor-size-default")
        for elem in product_elements:
            prod_title = elem.text.strip()
            if prod_title:
                if prod_title in product_category_map:
                    product_category_map[prod_title].add(category_name)
                else:
                    product_category_map[prod_title] = {category_name}
    except Exception:
        continue

# print("MAP CATEGORY")
# print(product_category_map)

with open("products2.csv", "w", newline="", encoding="utf-8") as csvfile:
    fieldnames = ["TITLE", "BRAND", "DESCRIPTION", "DETAILS", "CATEGORY", "IMG"]
    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
    writer.writeheader()
    
    for product in products_data:
        title = product["TITLE"]
        
        categories = ", ".join(product_category_map.get(title, []))
        writer.writerow({
            "TITLE": title,
            "BRAND": product["BRAND"],
            "DESCRIPTION": product["DESCRIPTION"].replace('\n', ' ').replace('\r', ' '),
            "DETAILS": product["DETAILS"].replace('\n', ' ').replace('\r', ' '),
            "CATEGORY": f'"{categories}"',
            "IMG": product["IMG"]
        })

driver.quit()
print("Scraping complete. Data written to products.csv")
