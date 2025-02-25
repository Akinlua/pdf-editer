import cv2

img = cv2.imread('image.png')
detector = cv2.QRCodeDetector()
data, points, _ = detector.detectAndDecode(img)
if points is not None:
    print(f"QR Code Data: {data}")
else:
    print("No QR code found.")
