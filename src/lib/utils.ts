import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";


// Add to the bottom of src/lib/utils.ts

export interface ProcessedProduct {
  originalId: string;
  uniqueKey: string;     
  name: string;
  srlNo: string;         
  displayName: string;   
  price: number;
}

export const processProductsForDropdown = (rawProducts: any[]): ProcessedProduct[] => {
  const expanded: ProcessedProduct[] = [];

  rawProducts.forEach(product => {
    // Look for both camelCase and snake_case API responses
    const rawSrl = product.srlNo || product.srl_no || ''; 
    const srlString = String(rawSrl).trim();

    if (srlString && srlString.includes(',')) {
      const srlArray = srlString.split(',').map((s: string) => s.trim());
      
      srlArray.forEach((srl: string) => {
        expanded.push({
          originalId: product.id,
          uniqueKey: `${product.id}-${srl}`, 
          name: product.name,
          srlNo: srl,
          displayName: `${product.name} (SRL: ${srl})`,
          price: product.price 
        });
      });
    } else {
      const srl = srlString ? srlString : 'N/A';
      expanded.push({
        originalId: product.id,
        uniqueKey: `${product.id}-${srl}`,
        name: product.name,
        srlNo: srl !== 'N/A' ? srl : '', // Keep it empty string if N/A
        displayName: srl !== 'N/A' ? `${product.name} (SRL: ${srl})` : product.name,
        price: product.price
      });
    }
  });

  return expanded;
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
