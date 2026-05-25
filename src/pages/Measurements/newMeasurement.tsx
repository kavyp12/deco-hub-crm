import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, Ruler } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import BlindsTable, { BlindRow, createEmptyBlindRow } from './BlindsTable';

type SystemType = 'Motorised' | 'Manual' | '';
type StyleType = 'Arabian' | 'American Pleat' | 'Box Pleat' | 'Roman' | '';
type CurtainType = 'Sheer' | 'Main' | 'Roman' | 'Double C-Main' | 'Double C-Sheer' | '';
type OpeningType = 'Center' | 'One Way: Left' | 'One Way: Right' | '';
type MotorType = 'RTS' | 'WY' | 'Both' | '';
type CablePosition = 'L' | 'R' | 'C' | '';

interface MeasurementRow {
  uid: string;
  areaName: string;
  system: SystemType;
  style: StyleType;
  type: CurtainType;
  height: string;
  width: string;
  pelmet: string;
  opening: OpeningType;
  motorType: MotorType;
  cablePosition: CablePosition;
  quantity: number;
  remark: string;
}

const COMMON_AREAS = [
  "Living Room", "Drawing Room", "Master Bedroom", "Kids Bedroom",
  "Guest Bedroom", "Parents Bedroom", "Dining Room", "Kitchen",
  "Study Room", "Home Office", "Balcony", "Verandah",
  "Puja Room", "Staircase", "Lobby", "Entrance",
  "Bathroom", "Store Room", "Servant Room", "Utility Area"
];

const SYSTEM_OPTIONS: SystemType[] = ['Motorised', 'Manual'];
const STYLE_OPTIONS: StyleType[] = ['Arabian', 'American Pleat', 'Box Pleat', 'Roman'];
const TYPE_OPTIONS: CurtainType[] = ['Sheer', 'Main', 'Roman', 'Double C-Main', 'Double C-Sheer'];
const OPENING_OPTIONS: OpeningType[] = ['Center', 'One Way: Left', 'One Way: Right'];
const MOTOR_TYPE_OPTIONS: MotorType[] = ['RTS', 'WY', 'Both'];
const CABLE_POSITION_OPTIONS: { value: CablePosition; label: string }[] = [
  { value: 'L', label: 'L (Left)' },
  { value: 'R', label: 'R (Right)' },
  { value: 'C', label: 'C (Center)' },
];

const IndependentMeasurementForm: React.FC = () => {
  const { inquiryId } = useParams<{ inquiryId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [inquiry, setInquiry] = useState<any>(null);
  const [selection, setSelection] = useState<any>(null);

  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [blindRows, setBlindRows] = useState<BlindRow[]>([]);
  const [globalRemark, setGlobalRemark] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'curtains' | 'blinds'>('curtains');

  useEffect(() => {
    const init = async () => {
      try {
        const inqRes = await api.get('/inquiries');
        const currentInquiry = inqRes.data.find((i: any) => i.id === inquiryId);

        if (!currentInquiry) {
          toast({ title: 'Error', description: 'Inquiry not found', variant: 'destructive' });
          navigate('/measurements');
          return;
        }
        setInquiry(currentInquiry);

        try {
          const selRes = await api.get(`/selections/by-inquiry/${inquiryId}`);

          if (selRes.data && selRes.data.items && selRes.data.items.length > 0) {
            setSelection(selRes.data);
            setGlobalRemark(selRes.data.notes || '');

            const curtainItems: any[] = [];
            const blindItems: any[] = [];
            selRes.data.items.forEach((item: any) => {
              if (item.details?.catalogType === 'Blinds') blindItems.push(item);
              else curtainItems.push(item);
            });

            const mappedRows: MeasurementRow[] = curtainItems.map((item: any) => ({
              uid: item.id || Math.random().toString(36).substr(2, 9),
              areaName: item.details?.areaName || item.areaName || '',
              system: (item.details?.system as SystemType) || '',
              style: (item.details?.style as StyleType) || '',
              type: (item.type as CurtainType) || '',
              height: item.height?.toString() || '',
              width: item.width?.toString() || '',
              pelmet: item.pelmet?.toString() || '',
              opening: (item.openingType as OpeningType) || '',
              motorType: (item.motorizationMode as MotorType) || '',
              cablePosition: (item.opsType as CablePosition) || '',
              quantity: item.quantity || 1,
              remark: item.details?.remark || '',
            }));
            setRows(mappedRows.length ? mappedRows : [createEmptyRow()]);

            const mappedBlinds: BlindRow[] = blindItems.map((item: any) => ({
              uid: item.id || Math.random().toString(36).substr(2, 9),
              areaName: item.details?.areaName || '',
              brand: item.details?.blindBrand || '',
              type: item.details?.blindType || '',
              system: item.details?.blindSystem || '',
              style: item.details?.blindStyle || '',
              collection: item.details?.blindCollection || '',
              shadeSRL: item.details?.blindShadeSRL || '',
              collectionTop: item.details?.blindCollectionTop || '',
              shadeSRLTop: item.details?.blindShadeSRLTop || '',
              collectionBottom: item.details?.blindCollectionBottom || '',
              shadeSRLBottom: item.details?.blindShadeSRLBottom || '',
              unit: item.unit || 'Inch',
              width: item.width?.toString() || '',
              height: item.height?.toString() || '',
              quantity: item.quantity || 1,
              operation: item.details?.blindOperation || '',
              fitting: item.details?.blindFitting || '',
              ladderTap: item.details?.blindLadderTap || '',
              motorization: item.details?.blindMotorization || '',
              motor: item.details?.blindMotor || '',
              remote: item.details?.blindRemote || '',
              wire: item.details?.blindWire || '',
              remark: item.details?.remark || '',
            }));
            setBlindRows(mappedBlinds.length ? mappedBlinds : [createEmptyBlindRow()]);
          } else {
            setRows([createEmptyRow()]);
            setBlindRows([createEmptyBlindRow()]);
          }
        } catch (error: any) {
          setRows([createEmptyRow()]);
          setBlindRows([createEmptyBlindRow()]);
        }
      } catch (error) {
        console.error('Init error:', error);
        toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    if (inquiryId) init();
  }, [inquiryId, navigate, toast]);

  const createEmptyRow = (): MeasurementRow => ({
    uid: Math.random().toString(36).substr(2, 9),
    areaName: '',
    system: '',
    style: '',
    type: '',
    height: '',
    width: '',
    pelmet: '',
    opening: '',
    motorType: '',
    cablePosition: '',
    quantity: 1,
    remark: '',
  });

  const handleAddRow = () => setRows(prev => [...prev, createEmptyRow()]);

  const handleRemoveRow = (index: number) => {
    if (rows.length === 1) {
      toast({ title: 'Warning', description: 'At least one row is required', variant: 'destructive' });
      return;
    }
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof MeasurementRow, value: any) => {
    setRows(prev => {
      const newRows = [...prev];
      newRows[index] = { ...newRows[index], [field]: value };
      // Clear motor fields when switching away from Motorised
      if (field === 'system' && value !== 'Motorised') {
        newRows[index].motorType = '';
        newRows[index].cablePosition = '';
      }
      return newRows;
    });
  };

  const handleSave = async () => {
    // Only validate rows that have ANY data filled in. Empty placeholder rows are skipped on save.
    const meaningfulCurtains = rows.filter(r => r.areaName.trim() || r.width || r.height || r.system || r.style || r.type);
    const meaningfulBlinds = blindRows.filter(r => r.areaName.trim() || r.width || r.height || r.brand || r.type || r.system);

    const invalidCurtains = meaningfulCurtains.filter(r => !r.areaName.trim());
    const invalidBlinds = meaningfulBlinds.filter(r => !r.areaName.trim());
    if (invalidCurtains.length > 0 || invalidBlinds.length > 0) {
      toast({ title: 'Validation Error', description: 'All filled rows must have an Area Name', variant: 'destructive' });
      return;
    }
    if (meaningfulCurtains.length === 0 && meaningfulBlinds.length === 0) {
      toast({ title: 'Nothing to save', description: 'Add at least one curtain or blind row.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const curtainItems = meaningfulCurtains.map(r => ({
        productId: null,
        productName: r.areaName || 'Curtain Item',
        quantity: r.quantity,
        price: 0,
        unit: 'inch',
        width: r.width ? parseFloat(r.width) : null,
        height: r.height ? parseFloat(r.height) : null,
        // Reuse existing DB columns to avoid a schema migration:
        type: r.type || null,                  // Sheer / Main / Roman / Double C-Main / Double C-Sheer
        motorizationMode: r.motorType || null, // RTS / WY / Both
        opsType: r.cablePosition || null,      // L / R / C
        pelmet: r.pelmet ? parseFloat(r.pelmet) : null,
        openingType: r.opening || null,        // Center / One Way: Left / One Way: Right
        areaName: r.areaName,
        catalogName: 'Curtains',
        catalogType: 'Curtains',
        details: {
          areaName: r.areaName,
          catalogName: 'Curtains',
          catalogType: 'Curtains',
          system: r.system,
          style: r.style,
          remark: r.remark,
        },
      }));

      const blindItems = meaningfulBlinds.map(r => ({
        productId: null,
        productName: r.areaName || 'Blind Item',
        quantity: r.quantity,
        price: 0,
        unit: r.unit,
        width: r.width ? parseFloat(r.width) : null,
        height: r.height ? parseFloat(r.height) : null,
        areaName: r.areaName,
        catalogName: 'Blinds',
        catalogType: 'Blinds',
        details: {
          areaName: r.areaName,
          catalogName: 'Blinds',
          catalogType: 'Blinds',
          blindBrand: r.brand,
          blindType: r.type,
          blindSystem: r.system,
          blindStyle: r.style,
          blindCollection: r.collection,
          blindShadeSRL: r.shadeSRL,
          blindCollectionTop: r.collectionTop,
          blindShadeSRLTop: r.shadeSRLTop,
          blindCollectionBottom: r.collectionBottom,
          blindShadeSRLBottom: r.shadeSRLBottom,
          blindOperation: r.operation,
          blindFitting: r.fitting,
          blindLadderTap: r.ladderTap,
          blindMotorization: r.motorization,
          blindMotor: r.motor,
          blindRemote: r.remote,
          blindWire: r.wire,
          remark: r.remark,
        },
      }));

      const payload = {
        inquiryId,
        status: selection?.status || 'pending',
        delivery_date: selection?.delivery_date || null,
        notes: globalRemark || null,
        items: [...curtainItems, ...blindItems],
      };

      if (selection) {
        await api.put(`/selections/${selection.id}`, payload);
      } else {
        await api.post('/selections', payload);
      }
      toast({ title: 'Success', description: 'Measurements saved successfully' });
      setTimeout(() => navigate('/selections'), 1000);
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to save measurements', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-[98vw] mx-auto animate-fade-in pb-20">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-start md:items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/measurements')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <Ruler className="h-5 w-5 md:h-6 md:w-6 text-primary" /> Measurement Form
              </h1>
              <div className="flex flex-wrap items-center gap-2 md:gap-3 text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">{inquiry?.client_name}</span>
                <span className="hidden md:inline h-1 w-1 bg-muted-foreground rounded-full" />
                <span className="text-xs bg-muted px-2 py-0.5 rounded">{inquiry?.inquiry_number}</span>
                <span className="hidden md:inline h-1 w-1 bg-muted-foreground rounded-full" />
                <span className="text-xs italic text-muted-foreground">Unit: Inch</span>
              </div>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} variant="accent" className="w-full md:w-auto gap-2 shadow-md">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'curtains' | 'blinds')}>
          <TabsList className="mb-4">
            <TabsTrigger value="curtains">Curtains ({rows.length})</TabsTrigger>
            <TabsTrigger value="blinds">Blinds ({blindRows.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="curtains">
        {/* Main Table */}
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ minWidth: '1500px' }}>
              <thead className="bg-gradient-to-r from-primary/10 to-primary/5 sticky top-0 z-10">
                {/* Group header row */}
                <tr>
                  <th rowSpan={2} className="p-2 w-10 text-center font-bold text-primary border-r border-b border-primary/20 sticky left-0 bg-primary/10 z-20">#</th>
                  <th rowSpan={2} className="p-2 w-40 text-left font-bold text-primary border-r border-b border-primary/20">Area Name</th>
                  <th rowSpan={2} className="p-2 w-32 text-left font-bold text-primary border-r border-b border-primary/20">System</th>
                  <th rowSpan={2} className="p-2 w-36 text-left font-bold text-primary border-r border-b border-primary/20">Style</th>
                  <th rowSpan={2} className="p-2 w-40 text-left font-bold text-primary border-r border-b border-primary/20">Type</th>
                  <th rowSpan={2} className="p-2 w-20 text-left font-bold text-primary border-r border-b border-primary/20">H (in)</th>
                  <th rowSpan={2} className="p-2 w-20 text-left font-bold text-primary border-r border-b border-primary/20">W (in)</th>
                  <th rowSpan={2} className="p-2 w-24 text-left font-bold text-primary border-r border-b border-primary/20">Pelmet Size</th>
                  <th rowSpan={2} className="p-2 w-36 text-left font-bold text-primary border-r border-b border-primary/20">Opening</th>
                  <th colSpan={2} className="p-2 text-center font-bold text-primary border-r border-b border-primary/20 bg-yellow-100">If Motorised then</th>
                  <th rowSpan={2} className="p-2 w-20 text-left font-bold text-primary border-r border-b border-primary/20">Quantity</th>
                  <th rowSpan={2} className="p-2 w-40 text-left font-bold text-primary border-r border-b border-primary/20">Remark</th>
                  <th rowSpan={2} className="p-2 w-10 sticky right-0 bg-primary/10 z-20 border-b border-primary/20"></th>
                </tr>
                <tr>
                  <th className="p-1 w-28 text-left font-semibold text-primary border-r border-b border-primary/20 bg-yellow-50 text-xs">Motor Type</th>
                  <th className="p-1 w-28 text-left font-semibold text-primary border-r border-b border-primary/20 bg-yellow-50 text-xs">Cable Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, idx) => {
                  const isMotorised = row.system === 'Motorised';
                  return (
                    <tr key={row.uid} className="group hover:bg-primary/5 transition-colors">
                      <td className="p-1 text-center text-xs text-muted-foreground border-r bg-muted/10 font-bold sticky left-0 z-10">{idx + 1}</td>

                      {/* Area */}
                      <td className="p-1 border-r">
                        <input
                          list={`area-suggestions-${row.uid}`}
                          value={row.areaName}
                          onChange={(e) => updateRow(idx, 'areaName', e.target.value)}
                          className="w-full h-9 px-2 text-xs border-transparent bg-transparent focus:bg-white focus:border-primary rounded"
                          placeholder="Area Name"
                        />
                        <datalist id={`area-suggestions-${row.uid}`}>
                          {COMMON_AREAS.map(area => <option key={area} value={area} />)}
                        </datalist>
                      </td>

                      {/* System */}
                      <td className="p-1 border-r">
                        <select
                          value={row.system}
                          onChange={(e) => updateRow(idx, 'system', e.target.value)}
                          className="w-full h-9 px-1 text-xs border-transparent bg-transparent focus:bg-white rounded"
                        >
                          <option value="">-</option>
                          {SYSTEM_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>

                      {/* Style */}
                      <td className="p-1 border-r">
                        <select
                          value={row.style}
                          onChange={(e) => updateRow(idx, 'style', e.target.value)}
                          className="w-full h-9 px-1 text-xs border-transparent bg-transparent focus:bg-white rounded"
                        >
                          <option value="">-</option>
                          {STYLE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>

                      {/* Type */}
                      <td className="p-1 border-r">
                        <select
                          value={row.type}
                          onChange={(e) => updateRow(idx, 'type', e.target.value)}
                          className="w-full h-9 px-1 text-xs border-transparent bg-transparent focus:bg-white rounded"
                        >
                          <option value="">-</option>
                          {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>

                      {/* H */}
                      <td className="p-1 border-r">
                        <input
                          type="number"
                          step="0.01"
                          value={row.height}
                          onChange={(e) => updateRow(idx, 'height', e.target.value)}
                          className="w-full h-9 px-2 text-xs text-right border-transparent bg-transparent focus:bg-white rounded"
                        />
                      </td>

                      {/* W */}
                      <td className="p-1 border-r">
                        <input
                          type="number"
                          step="0.01"
                          value={row.width}
                          onChange={(e) => updateRow(idx, 'width', e.target.value)}
                          className="w-full h-9 px-2 text-xs text-right border-transparent bg-transparent focus:bg-white rounded"
                        />
                      </td>

                      {/* Pelmet Size */}
                      <td className="p-1 border-r">
                        <input
                          type="number"
                          step="0.01"
                          value={row.pelmet}
                          onChange={(e) => updateRow(idx, 'pelmet', e.target.value)}
                          className="w-full h-9 px-2 text-xs text-right border-transparent bg-transparent focus:bg-white rounded"
                        />
                      </td>

                      {/* Opening */}
                      <td className="p-1 border-r">
                        <select
                          value={row.opening}
                          onChange={(e) => updateRow(idx, 'opening', e.target.value)}
                          className="w-full h-9 px-1 text-xs border-transparent bg-transparent focus:bg-white rounded"
                        >
                          <option value="">-</option>
                          {OPENING_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>

                      {/* Motor Type — only enabled when Motorised */}
                      <td className={`p-1 border-r ${!isMotorised ? 'bg-gray-50 opacity-50' : 'bg-yellow-50/30'}`}>
                        <select
                          value={row.motorType}
                          onChange={(e) => updateRow(idx, 'motorType', e.target.value)}
                          disabled={!isMotorised}
                          className="w-full h-9 px-1 text-xs bg-transparent border-transparent focus:bg-white rounded disabled:cursor-not-allowed"
                        >
                          <option value="">-</option>
                          {MOTOR_TYPE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>

                      {/* Cable Position — only enabled when Motorised */}
                      <td className={`p-1 border-r ${!isMotorised ? 'bg-gray-50 opacity-50' : 'bg-yellow-50/30'}`}>
                        <select
                          value={row.cablePosition}
                          onChange={(e) => updateRow(idx, 'cablePosition', e.target.value)}
                          disabled={!isMotorised}
                          className="w-full h-9 px-1 text-xs bg-transparent border-transparent focus:bg-white rounded disabled:cursor-not-allowed"
                        >
                          <option value="">-</option>
                          {CABLE_POSITION_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </td>

                      {/* Quantity */}
                      <td className="p-1 border-r">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={row.quantity}
                          onChange={(e) => updateRow(idx, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full h-9 px-2 text-xs text-right border-transparent bg-transparent focus:bg-white rounded"
                        />
                      </td>

                      {/* Remark */}
                      <td className="p-1 border-r">
                        <input
                          type="text"
                          value={row.remark}
                          onChange={(e) => updateRow(idx, 'remark', e.target.value)}
                          className="w-full h-9 px-2 text-xs border-transparent bg-transparent focus:bg-white rounded"
                          placeholder="Notes..."
                        />
                      </td>

                      {/* Delete */}
                      <td className="p-1 text-center sticky right-0 bg-white z-10 border-l">
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveRow(idx)} className="h-8 w-8 text-muted-foreground hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="p-4 border-t flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
            <Button variant="outline" onClick={handleAddRow} className="w-full sm:w-auto gap-2 border-dashed border-2">
              <Plus className="h-4 w-4" /> Add Row
            </Button>
            <div className="flex items-center justify-between w-full sm:w-auto gap-6 text-sm text-muted-foreground">
              <div>Total Rows: <span className="text-foreground font-bold">{rows.length}</span></div>
            </div>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="blinds">
            <BlindsTable rows={blindRows} setRows={setBlindRows} />
          </TabsContent>
        </Tabs>

        {/* Global Remark — applies to the whole measurement form */}
        <div className="mt-6 bg-white border rounded-xl shadow-sm p-4">
          <label className="block text-sm font-semibold text-primary mb-2">
            Overall Remark <span className="text-xs font-normal text-muted-foreground">(applies to the whole measurement)</span>
          </label>
          <textarea
            value={globalRemark}
            onChange={(e) => setGlobalRemark(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-border bg-white focus:border-primary rounded"
            placeholder="Add any notes about the overall site, customer instructions, etc."
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default IndependentMeasurementForm;
