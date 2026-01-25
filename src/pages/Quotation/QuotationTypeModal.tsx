// [FILE: src/components/QuotationTypeModal.tsx]
import React from 'react';
import { FileText, FileSpreadsheet, X } from 'lucide-react';

interface QuotationTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: 'simple' | 'detailed') => void;
  loading?: boolean;
}

export default function QuotationTypeModal({ isOpen, onClose, onSelect, loading }: QuotationTypeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 relative animate-in fade-in zoom-in duration-200">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Select Quotation Type</h2>
          <p className="text-sm text-gray-500 mt-1">Choose how you want to present this quotation</p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Simple Quotation */}
          <button
            onClick={() => onSelect('simple')}
            disabled={loading}
            className="group relative overflow-hidden rounded-lg border-2 border-gray-200 hover:border-blue-500 transition-all duration-200 p-6 text-left bg-gradient-to-br from-blue-50 to-white hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex flex-col h-full">
              <div className="mb-4">
                <div className="h-12 w-12 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Simple Quotation</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Clean, client-facing format with aggregated line items. Perfect for final proposals.
                </p>
              </div>
              
              <div className="mt-auto">
                <div className="text-xs text-gray-500 mb-2">Includes:</div>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>✓ Consolidated items by area</li>
                  <li>✓ Single price per line item</li>
                  <li>✓ Professional layout</li>
                </ul>
              </div>
            </div>
            
            {!loading && (
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
                  Select
                </div>
              </div>
            )}
          </button>

          {/* Detailed Quotation */}
          <button
            onClick={() => onSelect('detailed')}
            disabled={loading}
            className="group relative overflow-hidden rounded-lg border-2 border-gray-200 hover:border-green-500 transition-all duration-200 p-6 text-left bg-gradient-to-br from-green-50 to-white hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex flex-col h-full">
              <div className="mb-4">
                <div className="h-12 w-12 rounded-lg bg-green-100 text-green-600 flex items-center justify-center mb-3">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Detailed Quotation</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Comprehensive breakdown with all cost components. Ideal for internal reviews.
                </p>
              </div>
              
              <div className="mt-auto">
                <div className="text-xs text-gray-500 mb-2">Includes:</div>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>✓ Material, labor, hardware split</li>
                  <li>✓ Individual component pricing</li>
                  <li>✓ Full cost transparency</li>
                </ul>
              </div>
            </div>
            
            {!loading && (
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">
                  Select
                </div>
              </div>
            )}
          </button>

        </div>

        {/* Loading State */}
        {loading && (
          <div className="mt-4 text-center">
            <div className="inline-flex items-center gap-2 text-sm text-gray-600">
              <div className="h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
              Generating quotation...
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            You can always edit the quotation type later
          </p>
        </div>
      </div>
    </div>
  );
}