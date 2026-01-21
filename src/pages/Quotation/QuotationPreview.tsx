import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Download, Mail, Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { ToWords } from 'to-words';

// Initialize number-to-words converter
const toWords = new ToWords({
  localeCode: 'en-IN',
  converterOptions: { currency: true, ignoreDecimal: false, ignoreZeroCurrency: false },
});

const QuotationPreview: React.FC = () => {
  const { selectionId } = useParams();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  // --- FETCH REAL DATA ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get(`/quotations/preview/${selectionId}`);
        const apiData = res.data;
        
        const { selection, items, financials } = apiData;
        const inquiry = selection.inquiry;

        // Map API data to your Exact Structure
        const mappedData = {
          quotationNo: selection.selection_number || 'DRAFT',
          date: new Date().toLocaleDateString('en-IN'),
          salesAdvisor: inquiry.sales_person?.name || 'Sulit Decor',
          policyRef: 'Check Below',
          client: {
            name: inquiry.client_name,
            address: inquiry.address || 'Ahmedabad', 
          },
          delivery: {
            location: inquiry.address || 'Ahmedabad'
          },
          items: items.map((item: any) => ({
            sr: item.sr,
            // Combine Area + Description like your mock
            desc: item.area ? `${item.area} ${item.desc}` : item.desc,
            qty: item.qty,
            unit: item.unit,
            // Calculate Unit Price based on Total / Qty
            price: item.qty ? Math.round(item.total / item.qty) : 0, 
            total: item.total
          })),
          grossTotal: financials.subTotal,
          taxAmount: financials.tax || 0,
          finalTotal: financials.grandTotal,
          amountInWords: toWords.convert(financials.grandTotal)
        };

        setData(mappedData);
      } catch (error) {
        console.error(error);
        toast({ title: "Error", description: "Failed to load quotation data", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    if (selectionId) {
      fetchData();
    }
  }, [selectionId]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const element = printRef.current;
      const opt = {
        margin: [5, 5, 5, 5],
        filename: `Quotation_${data?.quotationNo}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      if (!(window as any).html2pdf) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.onload = () => {
          (window as any).html2pdf().set(opt).from(element).save().then(() => setDownloading(false));
        };
        document.body.appendChild(script);
      } else {
        (window as any).html2pdf().set(opt).from(element).save().then(() => setDownloading(false));
      }
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
      setDownloading(false);
    }
  };

  if (loading) return (
    <DashboardLayout>
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-[#ee4046]" />
      </div>
    </DashboardLayout>
  );

  if (!data) return null;

  return (
    <DashboardLayout>
      {/* --- CORRECTED PRINT CSS --- */}
      <style>{`
        @media print {
          /* 1. Hide everything by default */
          body * {
            visibility: hidden;
          }
          
          /* 2. Make the printable section visible */
          #printable-section, #printable-section * {
            visibility: visible;
          }

          /* 3. Position absolute lets content flow to multiple pages */
          #printable-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background: white;
            z-index: 9999;
          }

          /* 4. Remove margins from the page itself so our design controls it */
          @page {
            size: auto;
            margin: 5mm;
          }
        }
      `}</style>

      <div className="max-w-6xl mx-auto animate-fade-in pb-20">
        
        {/* --- Toolbar --- */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Quotation Preview</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2"><Mail className="h-4 w-4" /> Email</Button>
            
            <Button variant="outline" className="gap-2" onClick={handleDownloadPDF} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} 
              PDF
            </Button>
            
            <Button variant="default" onClick={handlePrint} className="gap-2 shadow-sm bg-blue-600 hover:bg-blue-700">
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        </div>

        {/* --- PRINTABLE CONTAINER --- */}
        <div className="flex justify-center print:block">
          <div 
            id="printable-section" 
            ref={printRef}
            className="bg-white text-black p-[10mm] shadow-xl w-[210mm] min-h-[297mm] text-xs font-sans relative print:shadow-none print:w-full print:min-h-0"
          >
            
            {/* 1. Header Section */}
            <div className="flex justify-between items-start mb-8">
              
              {/* Left: Branding & Address */}
              <div className="w-[55%]">
                <img 
                  src="/sulitblack-logo.svg" 
                  alt="Sulit Decor" 
                  className="h-12 mb-3 object-contain block" 
                />
                <div className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-1">
                  Sulit Decor Private Limited
                </div>
                <div className="text-[11px] text-gray-600 leading-relaxed">
                  <p>Showroom No.107, Aaron Spectra, Behind Rajpath Club,</p>
                  <p>Rajpat Rangoli Rd, Bodakdev, Ahmedabad, Gujarat, IN 380054</p>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 mt-1 font-medium text-black">
                    <span>E-mail: contact@sulitdecor.com</span>
                    <span className="hidden sm:inline">|</span>
                    <span>Mo.: +91 95583 09997</span>
                  </div>
                </div>
              </div>

              {/* Right: Quotation Metadata Table */}
              <div className="w-[45%] flex justify-end pt-2">
                <table className="text-xs border-collapse">
                  <tbody>
                    <tr>
                      <td className="font-bold text-gray-600 text-right pr-3 py-1 whitespace-nowrap w-28">QUOT NO. :</td>
                      <td className="font-bold text-black py-1">{data.quotationNo}</td>
                    </tr>
                    <tr>
                      <td className="font-bold text-gray-600 text-right pr-3 py-1 whitespace-nowrap">DATE :</td>
                      <td className="font-bold text-black py-1">{data.date}</td>
                    </tr>
                    <tr>
                      <td className="font-bold text-gray-600 text-right pr-3 py-1 whitespace-nowrap">SALES ADVISOR :</td>
                      <td className="font-bold text-black py-1">{data.salesAdvisor}</td>
                    </tr>
                    <tr>
                      <td className="font-bold text-gray-600 text-right pr-3 py-1 whitespace-nowrap">POLICY :</td>
                      <td className="font-bold text-black py-1">{data.policyRef}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. Bill To & Delivery Grid */}
            <div className="flex border-t border-b border-gray-300 py-4 mb-6 gap-8">
              <div className="flex-1">
                <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Buyer (Bill To) :</div>
                <div className="text-base font-bold text-gray-900">{data.client.name}</div>
                <div className="text-sm text-gray-600">{data.client.address}</div>
              </div>
              <div className="flex-1 border-l pl-8 border-gray-200">
                <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Delivery Details :</div>
                <div className="text-base font-bold text-gray-900">{data.delivery.location}</div>
              </div>
            </div>

            {/* 3. Items Table */}
            <div className="mb-6">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="py-2 px-1 text-center font-bold text-black w-12">Sr.No.</th>
                    <th className="py-2 px-2 text-left font-bold text-black">DESCRIPTION</th>
                    <th className="py-2 px-2 text-center font-bold text-black w-16">QTY</th>
                    <th className="py-2 px-2 text-center font-bold text-black w-16">UNIT</th>
                    <th className="py-2 px-2 text-right font-bold text-black w-24">PRICE</th>
                    <th className="py-2 px-2 text-right font-bold text-black w-32">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800">
                  {data.items.map((item: any, index: number) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 break-inside-avoid">
                      <td className="py-2.5 px-1 text-center text-gray-500">{item.sr}</td>
                      <td className="py-2.5 px-2 font-medium">{item.desc}</td>
                      <td className="py-2.5 px-2 text-center">{item.qty}</td>
                      <td className="py-2.5 px-2 text-center text-[10px] uppercase text-gray-500">{item.unit}</td>
                      <td className="py-2.5 px-2 text-right">₹{item.price.toLocaleString()}</td>
                      <td className="py-2.5 px-2 text-right font-semibold text-black">₹{item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 4. Totals & Bank Details */}
            <div className="flex gap-10 mb-8 break-inside-avoid">
              <div className="flex-grow space-y-5 pt-2">
                <div className="border border-gray-200 bg-gray-50 p-3 rounded text-xs">
                  <span className="font-bold text-red-600 mr-2">NOTE:-</span>
                  <span className="italic text-gray-700">"Client needs to provide 'H' Frame for Double-Height installation"</span>
                </div>
                <div className="text-xs">
                  <h3 className="font-bold text-gray-900 mb-2 underline decoration-gray-300 underline-offset-2">Company's Bank Details</h3>
                  <div className="grid grid-cols-[80px_1fr] gap-y-1 text-gray-700">
                    <span className="font-medium">Bank Name:</span>
                    <span>Punjab National Bank</span>
                    <span className="font-medium">A/C No.:</span>
                    <span>21211132000655</span>
                    <span className="font-medium">IFSC:</span>
                    <span>PUNB0212110 (Nehrunagar, Ahmedabad)</span>
                  </div>
                </div>
                <div className="pt-2">
                   <div className="text-[10px] font-bold text-gray-500 uppercase">Amount Chargeable (in words) :</div>
                   <div className="text-sm font-serif italic text-gray-800 capitalize mt-1 border-b border-dotted border-gray-300 pb-1 inline-block pr-10">
                     {data.amountInWords}
                   </div>
                </div>
              </div>

              <div className="w-[40%] pt-2">
                <div className="space-y-2">
                   <div className="flex justify-between text-xs text-gray-600">
                      <span>FABRIC & BLINDS GROSS TOTAL</span>
                      <span className="font-medium">₹{data.grossTotal.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between text-xs text-gray-600">
                      <span>GST / Tax</span>
                      <span className="font-medium">₹{data.taxAmount.toLocaleString()}</span>
                   </div>
                   <div className="border-t-2 border-black border-double mt-3 pt-3 flex justify-between text-base font-bold text-black items-center">
                      <span>Total</span>
                      <span className="bg-gray-100 px-3 py-1 rounded">₹{data.finalTotal.toLocaleString()}</span>
                   </div>
                </div>
              </div>
            </div>

            {/* 5. Signature Block */}
            <div className="grid grid-cols-2 mt-16 mb-10 gap-16 items-end break-inside-avoid">
               <div className="text-center">
                  <div className="h-px bg-gray-400 mb-2 w-full"></div>
                  <p className="font-bold text-xs text-gray-700">Customer's Seal and Signature</p>
               </div>
               
               <div className="text-center">
                  <p className="text-[10px] text-gray-500 mb-8 text-center w-full">For SULIT DECOR PRIVATE LIMITED</p>
                  <div className="h-px bg-gray-400 mb-2 w-full"></div>
                  <p className="font-bold text-xs text-gray-700">Authorised Signatory</p>
               </div>
            </div>

            {/* 6. Footer / Policies */}
            <footer className="text-[10px] leading-snug text-gray-600 border-t-2 border-gray-100 pt-6 break-inside-avoid">
               <div className="text-center mb-5 italic font-serif text-gray-400 text-xs">
                 "Be Faithful to your own taste, because nothing you really like is ever out of style" - Billy Baldwin
               </div>
               <div className="text-center space-y-1.5 mb-6">
                 <p className="font-bold text-black">Thanks a bunch for the warm visit to Sulit Décor! *****</p>
                 <p>Your Status and Prestige are appreciated and everyone gets the royal treatment here!</p>
                 <p>We believe in the Right to Equality and hence all our customers are equal to us.</p>
                 <p>And as formal as it sounds, we have a fixed policy for all and we hope for your valuable support through it.</p>
               </div>
               <div className="grid grid-cols-2 gap-8 text-justify">
                  <div>
                      <h4 className="font-bold text-black mb-2 border-b border-gray-200 pb-1 inline-block">Payment Terms:</h4>
                      <ul className="list-none space-y-2 mt-1">
                         <li className="flex gap-2"><span>✓</span><span>After confirming your order, an initial payment of 50% of the material cost is required. The remaining amount should be paid before we deliver the product to you.</span></li>
                         <li className="flex gap-2"><span>✓</span><span>Hardware and Labour costs can be paid on premise after product installation.</span></li>
                         <li className="flex gap-2"><span>✓</span><span>We are punctual and we expect the same. So in case of an outstanding payment, the product will be delivered once the full payment is made.</span></li>
                      </ul>
                  </div>
                  <div>
                      <div className="mb-4">
                        <h4 className="font-bold text-black mb-2 border-b border-gray-200 pb-1 inline-block">Government Guidelines:</h4>
                        <p className="mt-1 flex gap-2"><span>✓</span> <span>We comply with government guidelines; therefore, GST will apply on purchases.</span></p>
                      </div>
                      <div>
                        <h4 className="font-bold text-black mb-2 border-b border-gray-200 pb-1 inline-block">Return & Replacement Terms:</h4>
                        <ul className="list-none space-y-2 mt-1">
                           <li className="flex gap-2"><span>✓</span><span>We are Service Provider, so we do not provide any Guarantee or Warranty on materials after those are delivered and installed.</span></li>
                           <li className="flex gap-2"><span>✓</span><span>If the manufacturer of the product concerned allows return and replacement, we will gladly help you.</span></li>
                           <li className="flex gap-2"><span>✓</span><span>Products will not be changed, cancelled, or exchanged after your Final Confirmation of purchase.</span></li>
                        </ul>
                      </div>
                  </div>
               </div>
               <div className="text-center mt-6 pt-3 border-t border-gray-100">
                  <p className="font-bold text-black text-[10px] mb-1">
                    ▲ Kindly check in-detailed Key Points, that Client, PMC or respective Agency must Keep in Mind for Perfect Execution.
                  </p>
                  <a href="#" className="text-blue-600 hover:text-blue-800 underline decoration-blue-300">Click Here...</a>
               </div>
               <div className="text-center mt-6">
                  <div className="font-bold text-black text-xs">www.sulitdecor.com</div>
                  <div className="text-[9px] text-gray-400 mt-1 tracking-wider uppercase">Curtains | Upholstery | Window Blinds | Carpets | Rugs | Wallpapers</div>
               </div>
            </footer>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default QuotationPreview;