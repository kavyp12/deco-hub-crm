import os
from pathlib import Path
import sys

# Import your existing tools
# We use the functions you already built in your other files
try:
    from pdf_to_excel import pdf_to_excel
    from Catalog_standardizer import standardize_catalog
except ImportError:
    print("❌ Critical Error: Could not import 'pdf_to_excel' or 'Catalog_standardizer'.")
    print("   Make sure pdf_to_excel.py and Catalog_standardizer.py are in this folder.")
    sys.exit(1)

def run_workflow():
    # ==========================================
    # ⚙️ CONFIGURATION - YOUR FOLDER PATHS
    # ==========================================
    
    # 1. Source Folder (Where your PDFs are)
    PDF_SOURCE_DIR = r"C:\Users\kavyp\Downloads\sulit pdf format"
    
    # 2. Intermediate Folder (Where raw Excels will go)
    EXCEL_INTERMEDIATE_DIR = r"C:\Users\kavyp\Downloads\sulit excel format"
    
    # 3. Final Output Folder (Where the standardized files go)
    FINAL_OUTPUT_DIR = r"C:\Users\kavyp\Downloads\sulit main file"

    # ==========================================
    
    # Convert strings to Path objects and create folders if they don't exist
    pdf_source = Path(PDF_SOURCE_DIR)
    excel_intermediate = Path(EXCEL_INTERMEDIATE_DIR)
    final_output = Path(FINAL_OUTPUT_DIR)
    
    excel_intermediate.mkdir(parents=True, exist_ok=True)
    final_output.mkdir(parents=True, exist_ok=True)
    
    print("="*60)
    print("🚀 STARTING AUTOMATION WORKFLOW")
    print("="*60)
    print(f"📂 PDF Source:      {pdf_source}")
    print(f"📂 Intermediate:    {excel_intermediate}")
    print(f"📂 Final Output:    {final_output}")
    print("-" * 60)

    # ---------------------------------------------------------
    # STEP 1: PDF TO EXCEL CONVERSION
    # ---------------------------------------------------------
    print("\n[STEP 1/2] Converting PDFs to Excel...")
    
    if pdf_source.exists():
        pdf_files = list(pdf_source.glob("*.pdf"))
        
        if not pdf_files:
            print("   ⚠️  No PDF files found in source directory.")
        
        for i, pdf_file in enumerate(pdf_files, 1):
            # Define where the intermediate excel should be saved
            target_excel = excel_intermediate / f"{pdf_file.stem}.xlsx"
            
            # Skip if it already exists (optional, saves time)
            # if target_excel.exists():
            #     print(f"   Skipping {pdf_file.name} (Excel already exists)")
            #     continue
                
            print(f"   Converting {i}/{len(pdf_files)}: {pdf_file.name}...")
            
            # We call your pdf_to_excel function
            # method='auto' will detect if it's Fabrizio or Generic
            success = pdf_to_excel(str(pdf_file), str(target_excel), method='auto')
            
            if success:
                print(f"      ✅ Saved to: {target_excel.name}")
            else:
                print(f"      ❌ Failed to convert: {pdf_file.name}")
    else:
        print(f"❌ Error: PDF Source directory not found: {pdf_source}")

    # ---------------------------------------------------------
    # STEP 2: STANDARDIZATION (Intermediate -> Final)
    # ---------------------------------------------------------
    print("\n[STEP 2/2] Standardizing All Excel Files...")
    
    # We grab ALL xlsx files in the intermediate folder
    # This includes the ones we just converted AND any that were already there
    excel_files = list(excel_intermediate.glob("*.xlsx")) + list(excel_intermediate.glob("*.xls"))
    
    if not excel_files:
        print("   ⚠️  No Excel files found to standardize.")
    
    processed_count = 0
    
    for i, exc_file in enumerate(excel_files, 1):
        # Skip temporary files (like open Excel lock files starting with ~$)
        if exc_file.name.startswith("~$"):
            continue
            
        print(f"   Processing {i}/{len(excel_files)}: {exc_file.name}...")
        
        # Define final output path
        # We append _FINAL so you know it's the finished version
        target_final = final_output / f"{exc_file.stem}_FINAL.xlsx"
        
        # Call your standardization function
        success = standardize_catalog(str(exc_file), str(target_final))
        
        if success:
            processed_count += 1
            print(f"      ✅ Standardized: {target_final.name}")
        else:
            print(f"      ❌ Failed to standardize: {exc_file.name}")

    # ---------------------------------------------------------
    # SUMMARY
    # ---------------------------------------------------------
    print("\n" + "="*60)
    print("🏁 WORKFLOW COMPLETE")
    print("="*60)
    print(f"Files in Final Folder: {len(list(final_output.glob('*.xlsx')))}")
    print(f"Check your output here: {final_output}")
    input("\nPress Enter to exit...")

if __name__ == "__main__":
    run_workflow()