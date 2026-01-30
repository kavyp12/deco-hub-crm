#!/usr/bin/env python3
"""
Batch Catalog Processor - Process multiple catalogs at once
"""

import sys
import os
from pathlib import Path
from catalog_standardizer import standardize_catalog
from pdf_to_excel import pdf_to_excel

def process_directory(input_dir, output_dir=None):
    """Process all catalog files in a directory"""
    
    input_path = Path(input_dir)
    
    if not input_path.exists():
        print(f"Error: Directory not found: {input_dir}")
        return False
    
    if output_dir is None:
        output_dir = input_path / "standardized_catalogs"
    else:
        output_dir = Path(output_dir)
    
    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Processing catalogs from: {input_path}")
    print(f"Output directory: {output_dir}")
    print("=" * 80)
    
    # Find all Excel and PDF files
    excel_files = list(input_path.glob("*.xlsx")) + list(input_path.glob("*.xls"))
    pdf_files = list(input_path.glob("*.pdf"))
    
    total_files = len(excel_files) + len(pdf_files)
    processed = 0
    failed = 0
    
    print(f"\nFound {len(excel_files)} Excel files and {len(pdf_files)} PDF files")
    print("=" * 80)
    
    # Process PDFs first (convert to Excel)
    for pdf_file in pdf_files:
        print(f"\n[{processed + 1}/{total_files}] Processing PDF: {pdf_file.name}")
        
        # Extract PDF to Excel
        temp_excel = output_dir / f"{pdf_file.stem}_extracted.xlsx"
        
        if pdf_to_excel(str(pdf_file), str(temp_excel)):
            # Now standardize the extracted Excel
            final_output = output_dir / f"{pdf_file.stem}_STANDARDIZED.xlsx"
            
            if standardize_catalog(str(temp_excel), str(final_output)):
                # Remove temp file
                temp_excel.unlink()
                processed += 1
            else:
                print(f"  ⚠️  Failed to standardize extracted data")
                failed += 1
        else:
            print(f"  ⚠️  Failed to extract PDF data")
            failed += 1
    
    # Process Excel files
    for excel_file in excel_files:
        print(f"\n[{processed + 1}/{total_files}] Processing Excel: {excel_file.name}")
        
        output_file = output_dir / f"{excel_file.stem}_STANDARDIZED.xlsx"
        
        if standardize_catalog(str(excel_file), str(output_file)):
            processed += 1
        else:
            failed += 1
    
    # Summary
    print("\n" + "=" * 80)
    print("BATCH PROCESSING COMPLETE")
    print("=" * 80)
    print(f"Total files: {total_files}")
    print(f"✅ Processed successfully: {processed}")
    if failed > 0:
        print(f"❌ Failed: {failed}")
    print(f"\nStandardized catalogs saved to: {output_dir}")
    
    return failed == 0

def process_file(input_file, output_file=None):
    """Process a single file (PDF or Excel)"""
    
    input_path = Path(input_file)
    
    if not input_path.exists():
        print(f"Error: File not found: {input_file}")
        return False
    
    if output_file is None:
        output_file = input_path.parent / f"{input_path.stem}_STANDARDIZED.xlsx"
    
    # Check file type
    if input_path.suffix.lower() == '.pdf':
        print("PDF detected - converting to Excel first...")
        
        # Extract to temp Excel
        temp_excel = input_path.parent / f"{input_path.stem}_temp.xlsx"
        
        if not pdf_to_excel(str(input_path), str(temp_excel)):
            return False
        
        # Standardize the extracted Excel
        result = standardize_catalog(str(temp_excel), str(output_file))
        
        # Clean up temp file
        temp_excel.unlink()
        
        return result
    
    elif input_path.suffix.lower() in ['.xlsx', '.xls']:
        return standardize_catalog(str(input_path), str(output_file))
    
    else:
        print(f"Error: Unsupported file type: {input_path.suffix}")
        print("Supported types: .xlsx, .xls, .pdf")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Batch Catalog Processor")
        print("=" * 80)
        print("\nUsage:")
        print("  Process single file:")
        print("    python batch_processor.py <file> [output_file]")
        print("\n  Process entire directory:")
        print("    python batch_processor.py --dir <directory> [output_dir]")
        print("\nExamples:")
        print("  python batch_processor.py catalog.xlsx")
        print("  python batch_processor.py catalog.pdf standardized.xlsx")
        print("  python batch_processor.py --dir ./catalogs")
        print("  python batch_processor.py --dir ./catalogs ./output")
        sys.exit(1)
    
    if sys.argv[1] == '--dir':
        if len(sys.argv) < 3:
            print("Error: Directory path required")
            sys.exit(1)
        
        input_dir = sys.argv[2]
        output_dir = sys.argv[3] if len(sys.argv) > 3 else None
        
        success = process_directory(input_dir, output_dir)
    else:
        input_file = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None
        
        success = process_file(input_file, output_file)
    
    sys.exit(0 if success else 1)