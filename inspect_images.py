import os

try:
    from PIL import Image
    import pytesseract
    print("PIL and pytesseract available!")
except ImportError as e:
    print("Import error:", e)

    # Let's test if easyocr or cv2 or urllib is available
