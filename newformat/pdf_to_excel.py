#!/usr/bin/env python3
"""
PDF Catalog Converter - Extract catalog data from PDFs to Excel format
"""

import re
import sys
import pandas as pd
from pathlib import Path
import pdfplumber

def extract_fabrizio_data(pdf_path):
    """Extract data from Fabrizio-style PDF catalogs using Regex"""
    
    products = []
    
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            
            if not text:
                continue
            
            # Split by lines
            lines = text.split('\n')
            
            for line in lines:
                # Look for product rows (contains composition, martindale, etc.)
                if any(keyword in line.upper() for keyword in ['100%', 'POLYESTER', 'PES', 'PVC', 'NYL']):
                    
                    # Skip header rows clearly
                    if 'COMPOSITION' in line.upper() or 'PRODUCT' in line.upper():
                        continue
                    
                    try:
                        product = {}
                        
                        # Regex patterns
                        # Collection and Product name (First 2 words usually)
                        # We look for patterns like "REVO REVO 100%..."
                        parts = line.split()
                        if len(parts) > 3:
                             # Heuristic: First two items are names, then composition starts
                             # This is basic and might need tuning per line, but works for the provided examples
                            product['COLLECTION NAME'] = parts[0]
                            product['PRODUCT NAME'] = parts[1]

                        # Composition: Look for % patterns
                        comp_match = re.search(r'([A-Z0-9%,]+\s*[A-Z%]+)', line)
                        if comp_match:
                             # Refine composition capture
                             if '%' in comp_match.group(0):
                                product['COMPOSITION'] = comp_match.group(0).strip()
                        
                        # Martindale (digits followed by +)
                        martindale_match = re.search(r'(\d{4,6}\+)', line)
                        if martindale_match:
                            product['MARTINDALE'] = martindale_match.group(1).strip()
                        
                        # HSN Code (8 digits)
                        hsn_match = re.search(r'(\d{8})', line)
                        if hsn_match:
                            product['HSNCODE'] = hsn_match.group(1).strip()
                        
                        # Width (Usually around 137-145)
                        width_match = re.search(r'\b(13[0-9]|14[0-9]|150|280|300)\b', line)
                        if width_match:
                             # Ensure it's not part of the HSN
                            if width_match.group(1) not in (product.get('HSNCODE', '')):
                                product['WIDTH(INCM)'] = width_match.group(1).strip()
                        
                        # GSM (3 digits, usually 200-900)
                        # This is tricky regex, skipping for basic stability unless clear pattern exists
                        
                        # GST (5% or similar)
                        gst_match = re.search(r'(\d+%)', line)
                        if gst_match:
                             # Ensure this isn't the composition
                             if "POLY" not in line[gst_match.start()-5:gst_match.start()]:
                                product['GST'] = gst_match.group(1).strip()
                        
                        # DP (price at end, format: 350/- or just number)
                        dp_match = re.search(r'(\d{3,4})/?-?\s*$', line)
                        if dp_match:
                            product['DP'] = dp_match.group(1).strip().replace('/-', '')
                        
                        # Only add if we got some key fields
                        if len(product) >= 3:
                            products.append(product)
                        
                    except Exception:
                        continue
    
    return products

def extract_generic_table(pdf_path):
    """Extract tables from any PDF using pdfplumber's table detection"""
    
    all_data = []
    
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            # Extract tables
            tables = page.extract_tables()
            
            for table in tables:
                if not table or len(table) < 2:
                    continue
                
                # Get headers and CLEAN them
                raw_headers = table[0]
                headers = []
                for i, h in enumerate(raw_headers):
                    if h is None or str(h).strip() == "":
                        headers.append(f"Column_{i}") # Give default name to empty headers
                    else:
                        # Remove newlines and extra spaces from headers
                        headers.append(str(h).replace('\n', ' ').strip())
                
                # Add data rows
                for row in table[1:]:
                    # Ensure row length matches headers
                    if len(row) == len(headers):
                        # Clean row data (handle None)
                        clean_row = [str(cell).strip() if cell is not None else "" for cell in row]
                        row_dict = dict(zip(headers, clean_row))
                        
                        # Skip empty rows
                        if any(clean_row):
                            all_data.append(row_dict)
    
    return all_data

def pdf_to_excel(pdf_path, output_path=None, method='auto'):
    pdf_path = Path(pdf_path)
    
    if not pdf_path.exists():
        print(f"Error: File not found: {pdf_path}")
        return False
    
    if output_path is None:
        output_path = pdf_path.parent / f"{pdf_path.stem}_EXTRACTED.xlsx"
    
    print(f"Extracting data from {pdf_path.name}...")
    
    try:
        # Detect method
        if method == 'auto':
            # Check filename OR content hint could go here
            if 'FABRIZIO' in pdf_path.name.upper() or 'PRICE LIST' in pdf_path.name.upper():
                 # NEW PRICE LIST is likely Fabrizio style too
                method = 'fabrizio'
            else:
                method = 'generic'
        
        # Extract data
        if method == 'fabrizio':
            print("  Using Fabrizio-specific extraction...")
            data = extract_fabrizio_data(pdf_path)
            # Fallback if specific method fails
            if not data: 
                print("  ! Specific extraction found no data, falling back to generic...")
                data = extract_generic_table(pdf_path)
        else:
            print("  Using generic table extraction...")
            data = extract_generic_table(pdf_path)
        
        if not data:
            print("  ⚠️  No data extracted. PDF may not contain tables.")
            return False
        
        # Convert to DataFrame
        df = pd.DataFrame(data)
        
        # Save to Excel
        df.to_excel(output_path, index=False, engine='openpyxl')
        
        print(f"✅ SUCCESS! Extracted {len(df)} rows to: {output_path}")
        # Safe printing of columns (handles None or non-string headers)
        safe_cols = [str(c) for c in df.columns]
        print(f"   Columns: {', '.join(safe_cols)}")
        
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python pdf_to_excel.py <pdf_file> [output_file] [method]")
        sys.exit(1)
    
    pdf_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    method = sys.argv[3] if len(sys.argv) > 3 else 'auto'
    
    success = pdf_to_excel(pdf_file, output_file, method)
    sys.exit(0 if success else 1)