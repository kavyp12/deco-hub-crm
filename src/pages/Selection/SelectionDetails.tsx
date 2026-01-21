import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Scissors } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface SelectionItem {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  details: any;
}

interface SelectionDetail {
  id: string;
  selection_number: string;
  status: string;
  selection_date: string;
  delivery_date: string | null;
  notes: string | null;
  items: SelectionItem[];
  inquiry: {
    client_name: string;
    inquiry_number: string;
    address: string;
    mobile_number: string;
    architect_id_name: string;
    product_category: string;
    sales_person: {
      name: string;
    };
  };
}

const SelectionDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [selection, setSelection] = useState<SelectionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSelection = async () => {
      try {
        const { data } = await api.get(`/selections/${id}`);
        setSelection(data);
      } catch (error) {
        console.error('Error fetching selection:', error);
        toast({
          title: 'Error',
          description: 'Failed to load selection details.',
          variant: 'destructive',
        });
        navigate('/selections');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchSelection();
    }
  }, [id, navigate, toast]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!selection) return null;

  // Constants for layout
  const TOTAL_ROWS = 14;
  const emptyRows = Math.max(0, TOTAL_ROWS - selection.items.length);

  return (
    <DashboardLayout>
      <div className="max-w-[210mm] mx-auto animate-fade-in pb-10">
        
        {/* Header Actions - Hidden in Print */}
        <div className="no-print flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate('/selections')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Selections
          </Button>
          <Button variant="default" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" /> Print Selection Form
          </Button>
        </div>

        {/* PRINTABLE SELECTION FORM */}
        <div className="print-container bg-white shadow-lg print:shadow-none relative min-h-[297mm] flex flex-col">
          
          {/* Grey Header Block */}
          <div className="bg-[#e6e7e8] h-32 w-full relative">
            
            {/* Logo Area - Top Right */}
            <div className="absolute right-10 top-8">
               <img src="/sulitblack-logo.svg" alt="Sulit Bespoke Living" className="h-14 object-contain" />
            </div>

            <div className="absolute -bottom-px left-10">
              <div className="bg-white text-[#da291c] font-bold px-8 py-2 text-sm tracking-wide uppercase rounded-t-xl">
                Selection Form
              </div>
            </div>

          </div>

          {/* Form Fields Section */}
          <div className="pt-8 px-10 space-y-3 mb-6">
            {/* Row 1 */}
            <div className="flex gap-12">
              <div className="flex-1 flex items-end">
                <span className="text-sm font-semibold text-gray-700 min-w-[90px]">Inquiry no.:</span>
                <div className="flex-1 border-b border-gray-300 text-sm pl-2 pb-0.5 font-medium">{selection.inquiry.inquiry_number}</div>
              </div>
              <div className="flex-1 flex items-end">
                <span className="text-sm font-semibold text-gray-700 min-w-[60px]">Date:</span>
                <div className="flex-1 border-b border-gray-300 text-sm pl-2 pb-0.5 font-medium">{format(new Date(selection.selection_date), 'dd/MM/yyyy')}</div>
              </div>
            </div>

            {/* Row 2 */}
            <div className="flex gap-12">
              <div className="flex-1 flex items-end">
                <span className="text-sm font-semibold text-gray-700 min-w-[90px]">Client Name :</span>
                <div className="flex-1 border-b border-gray-300 text-sm pl-2 pb-0.5 font-medium">{selection.inquiry.client_name}</div>
              </div>
              <div className="flex-1 flex items-end">
                <span className="text-sm font-semibold text-gray-700 min-w-[60px]">Address :</span>
                <div className="flex-1 border-b border-gray-300 text-sm pl-2 pb-0.5 font-medium truncate">{selection.inquiry.address}</div>
              </div>
            </div>

            {/* Row 3 */}
            <div className="flex gap-12">
              <div className="flex-1 flex items-end">
                <span className="text-sm font-semibold text-gray-700 min-w-[130px]">Architect/ID Name :</span>
                <div className="flex-1 border-b border-gray-300 text-sm pl-2 pb-0.5 font-medium">{selection.inquiry.architect_id_name}</div>
              </div>
              <div className="flex-1 flex items-end">
                <span className="text-sm font-semibold text-gray-700 min-w-[90px]">Sales Person :</span>
                <div className="flex-1 border-b border-gray-300 text-sm pl-2 pb-0.5 font-medium">{selection.inquiry.sales_person?.name}</div>
              </div>
            </div>

            {/* Row 4 */}
            <div className="flex gap-12">
              <div className="flex-1 flex items-end">
                <span className="text-sm font-semibold text-gray-700 min-w-[90px]">Mobile No :</span>
                <div className="flex-1 border-b border-gray-300 text-sm pl-2 pb-0.5 font-medium">{selection.inquiry.mobile_number}</div>
              </div>
              <div className="flex-1 flex items-end">
                <span className="text-sm font-semibold text-gray-700 min-w-[130px]">Expected Final Date :</span>
                <div className="flex-1 border-b border-gray-300 text-sm pl-2 pb-0.5 font-medium">
                  {selection.delivery_date ? format(new Date(selection.delivery_date), 'dd/MM/yyyy') : ''}
                </div>
              </div>
            </div>
          </div>

          {/* Main Table */}
          <div className="px-10 mb-6">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#da291c] text-white">
                  <th className="py-1.5 px-2 text-center border-r border-white/30 text-sm font-medium w-12">Sr.</th>
                  <th className="py-1.5 px-2 text-center border-r border-white/30 text-sm font-medium w-1/4">Area Name</th>
                  <th className="py-1.5 px-2 text-center border-r border-white/30 text-sm font-medium w-1/4">Catalogue</th>
                  <th className="py-1.5 px-2 text-center border-r border-white/30 text-sm font-medium w-1/4">Code</th>
                  <th className="py-1.5 px-2 text-center border-r border-white/30 text-sm font-medium w-24">Quantity</th>
                  <th className="py-1.5 px-2 text-center text-sm font-medium w-24">RRP</th>
                </tr>
              </thead>
              <tbody className="text-xs text-gray-800">
                {selection.items.map((item, idx) => (
                  <tr key={item.id} className="border-b border-gray-200 h-8">
                    <td className="border-x border-gray-300 text-center">{idx + 1}</td>
                    {/* Fixed to read from details object */}
                    <td className="border-r border-gray-300 px-2">{item.details?.areaName || ''}</td>
                    <td className="border-r border-gray-300 px-2">{item.details?.catalogName || ''}</td>
                    <td className="border-r border-gray-300 px-2">{item.productName}</td>
                    <td className="border-r border-gray-300 text-center">{item.quantity}</td>
                    <td className="border-r border-gray-300 text-right px-2">₹ {item.total.toLocaleString()}</td>
                  </tr>
                ))}
                {/* Empty Rows Filler */}
                {Array.from({ length: emptyRows }).map((_, idx) => (
                  <tr key={`empty-${idx}`} className="border-b border-gray-200 h-8">
                    <td className="border-x border-gray-300"></td>
                    <td className="border-r border-gray-300"></td>
                    <td className="border-r border-gray-300"></td>
                    <td className="border-r border-gray-300"></td>
                    <td className="border-r border-gray-300"></td>
                    <td className="border-r border-gray-300"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Remarks Section */}
          <div className="px-10 space-y-4 mb-8">
            <div className="flex items-end">
              <span className="text-sm font-medium text-gray-700 min-w-[80px]">Any Other :</span>
              <div className="flex-1 border-b border-gray-300 h-5"></div>
            </div>
            <div className="flex items-end">
              <span className="text-sm font-medium text-gray-700 min-w-[80px]">Remarks :</span>
              <div className="flex-1 border-b border-gray-300 text-sm px-2 pb-0.5">{selection.notes}</div>
            </div>
            <div className="flex items-end pt-4">
              <span className="text-sm font-medium text-gray-700 min-w-[120px]">Forwarder Name :</span>
              <div className="flex-1 border-b border-gray-300 h-5"></div>
            </div>
          </div>

          {/* Cut Line */}
          <div className="relative h-10 flex items-center mb-6">
            <Scissors className="absolute left-4 text-gray-400 h-5 w-5 bg-white z-10 p-0.5" />
            <div className="w-full border-t-2 border-dashed border-gray-300"></div>
          </div>

          {/* Bottom Receipt Section */}
          <div className="px-10 space-y-4 mb-12">
            <div className="flex gap-12">
              <div className="flex-1 flex items-end">
                <span className="text-sm font-semibold text-gray-700 min-w-[90px]">Client Name :</span>
                <div className="flex-1 border-b border-gray-300 h-5"></div>
              </div>
              <div className="flex-1 flex items-end">
                <span className="text-sm font-semibold text-gray-700 min-w-[90px]">Inquiry No. :</span>
                <div className="flex-1 border-b border-gray-300 h-5"></div>
              </div>
            </div>
            <div className="flex gap-12">
              <div className="flex-1 flex items-end">
                <span className="text-sm font-semibold text-gray-700 min-w-[90px]">Sales Person :</span>
                <div className="flex-1 border-b border-gray-300 h-5"></div>
              </div>
              <div className="flex-1 flex items-end">
                <span className="text-sm font-semibold text-gray-700 min-w-[90px]">Contact No. :</span>
                <div className="flex-1 border-b border-gray-300 h-5"></div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-[#f2f2f2] px-10 py-4 flex items-center justify-between mt-auto">
            <div className="w-1/3">
              <img src="/sulitblack-logo.svg" alt="Sulit Logo" className="h-8 object-contain" />
            </div>
            <div className="text-[10px] text-gray-500 text-right leading-tight">
              <p>Showroom No. 108, Aaron Spectra, Behind Rajpath Club, Ahmedabad, Gujarat 380054.</p>
              <p className="mt-0.5">+91 78170 79997 / 72288 09997 &nbsp;|&nbsp; contact@sulitdecor.com &nbsp;|&nbsp; www.sulitdecor.com</p>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @media print {
          /* Reset page */
          @page { 
            margin: 0; 
            size: A4 portrait; 
          }
          
          /* Force white background and color printing */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm;
            height: 297mm;
            background: white !important;
          }
          
          /* Hide everything except the print container */
          body * {
            visibility: hidden;
          }
          
          .print-container,
          .print-container * {
            visibility: visible;
          }
          
          .print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
          }
          
          /* Hide non-print elements */
          .no-print {
            display: none !important;
            visibility: hidden !important;
          }
          
          /* Preserve background colors */
          .bg-\\[\\#e6e7e8\\] {
            background-color: #e6e7e8 !important;
          }
          
          .bg-\\[\\#da291c\\] {
            background-color: #da291c !important;
          }
          
          .bg-\\[\\#f2f2f2\\] {
            background-color: #f2f2f2 !important;
          }
          
          .text-\\[\\#da291c\\] {
            color: #da291c !important;
          }
          
          /* Table colors */
          thead tr {
            background-color: #da291c !important;
          }
          
          thead th {
            background-color: #da291c !important;
            color: white !important;
          }
          
          /* Border colors */
          .border-gray-300 {
            border-color: #d1d5db !important;
          }
          
          .border-gray-200 {
            border-color: #e5e7eb !important;
          }
        }
      `}</style>
    </DashboardLayout>
  );
};

export default SelectionDetails;