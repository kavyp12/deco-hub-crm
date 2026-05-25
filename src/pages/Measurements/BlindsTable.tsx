import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type BlindBrand = 'Adorn' | 'Ddecor' | 'Ami' | 'Liger' | 'Ideal' | '';
export type BlindType = 'Roller' | 'Zebra (Sonatine)' | 'Tripple Shade (Solarette)' | 'Wooden Venetian' | 'Honeycomb' | '';
export type BlindSystem = 'Manual' | 'Motorised' | '';
export type BlindUnit = 'Inch' | 'cm' | 'mm';
export type BlindOperation = 'L' | 'R' | '';
export type BlindFitting = 'Inside' | 'Outside' | '';
export type BlindMotorization = 'Remote' | 'Automation' | 'Both' | '';
export type BlindWire = 'L' | 'R' | 'C' | 'Both Side' | '';

export interface BlindRow {
  uid: string;
  areaName: string;
  brand: BlindBrand;
  type: BlindType;
  system: BlindSystem;
  style: string;
  collection: string;
  shadeSRL: string;
  // D/N (Honeycomb) only
  collectionTop: string;
  shadeSRLTop: string;
  collectionBottom: string;
  shadeSRLBottom: string;
  unit: BlindUnit;
  width: string;
  height: string;
  quantity: number;
  // Universal (both Manual and Motorised)
  fitting: BlindFitting;
  ladderTap: string; // Wooden Venetian only
  // Manual only
  operation: BlindOperation;
  // Motorised only
  motorization: BlindMotorization;
  motor: string;
  remote: string;
  wire: BlindWire;
  remark: string;
}

export const createEmptyBlindRow = (): BlindRow => ({
  uid: Math.random().toString(36).substr(2, 9),
  areaName: '',
  brand: '',
  type: '',
  system: '',
  style: '',
  collection: '',
  shadeSRL: '',
  collectionTop: '',
  shadeSRLTop: '',
  collectionBottom: '',
  shadeSRLBottom: '',
  unit: 'Inch',
  width: '',
  height: '',
  quantity: 1,
  fitting: '',
  ladderTap: '',
  operation: '',
  motorization: '',
  motor: '',
  remote: '',
  wire: '',
  remark: '',
});

const BRAND_OPTIONS: BlindBrand[] = ['Adorn', 'Ddecor', 'Ami', 'Liger', 'Ideal'];
const TYPE_OPTIONS: BlindType[] = ['Roller', 'Zebra (Sonatine)', 'Tripple Shade (Solarette)', 'Wooden Venetian', 'Honeycomb'];
const SYSTEM_OPTIONS: BlindSystem[] = ['Manual', 'Motorised'];
const UNIT_OPTIONS: BlindUnit[] = ['Inch', 'cm', 'mm'];
const OPERATION_OPTIONS: BlindOperation[] = ['L', 'R'];
const FITTING_OPTIONS: BlindFitting[] = ['Inside', 'Outside'];
const MOTORIZATION_OPTIONS_ALL: BlindMotorization[] = ['Remote', 'Automation', 'Both'];
const MOTORIZATION_OPTIONS_DN: BlindMotorization[] = ['Remote'];
const WIRE_OPTIONS: BlindWire[] = ['L', 'R', 'C', 'Both Side'];

const STYLE_OPTIONS_BY_TYPE: Record<BlindType, string[]> = {
  '': [],
  'Roller': ['Classic', 'Fasia'],
  'Zebra (Sonatine)': ['Fasia'],
  'Tripple Shade (Solarette)': ['Fasia'],
  'Wooden Venetian': ['Cord', 'Chain'],
  'Honeycomb': ['Classic', 'TDBU', 'D/N'],
};

const COMMON_AREAS = [
  'Living Room', 'Drawing Room', 'Master Bedroom', 'Kids Bedroom',
  'Guest Bedroom', 'Dining Room', 'Kitchen', 'Study Room',
  'Balcony', 'Puja Room', 'Entrance', 'Lobby',
];

interface Props {
  rows: BlindRow[];
  setRows: React.Dispatch<React.SetStateAction<BlindRow[]>>;
}

const BlindsTable: React.FC<Props> = ({ rows, setRows }) => {
  const handleAddRow = () => setRows(prev => [...prev, createEmptyBlindRow()]);

  const handleRemoveRow = (index: number) => {
    if (rows.length === 1) {
      setRows([createEmptyBlindRow()]);
      return;
    }
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof BlindRow, value: any) => {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };

      // When Type changes, reset Style and clear fields that no longer apply
      if (field === 'type') {
        next[index].style = '';
        if (value !== 'Honeycomb') {
          next[index].collectionTop = '';
          next[index].shadeSRLTop = '';
          next[index].collectionBottom = '';
          next[index].shadeSRLBottom = '';
        }
        if (value !== 'Wooden Venetian') {
          next[index].ladderTap = '';
        }
      }

      // When Style changes away from D/N, clear D/N fields
      if (field === 'style' && value !== 'D/N') {
        next[index].collectionTop = '';
        next[index].shadeSRLTop = '';
        next[index].collectionBottom = '';
        next[index].shadeSRLBottom = '';
      }

      // When System changes, clear the group that no longer applies
      // (Fitting and Ladder Tap are universal — never cleared by System change)
      if (field === 'system') {
        if (value !== 'Manual') {
          next[index].operation = '';
        }
        if (value !== 'Motorised') {
          next[index].motorization = '';
          next[index].motor = '';
          next[index].remote = '';
          next[index].wire = '';
        }
      }

      // Honeycomb + D/N + Motorised → only 'Remote' is a valid Motorization.
      // If a row enters that state with a non-Remote motorization already set, reset it.
      const r = next[index];
      const isDNMotor = r.type === 'Honeycomb' && r.style === 'D/N' && r.system === 'Motorised';
      if (isDNMotor && r.motorization && r.motorization !== 'Remote') {
        next[index].motorization = '';
      }

      return next;
    });
  };

  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: '2400px' }}>
          <thead className="bg-gradient-to-r from-primary/10 to-primary/5 sticky top-0 z-10">
            <tr>
              <th rowSpan={2} className="p-2 w-10 text-center font-bold text-primary border-r border-b border-primary/20 sticky left-0 bg-primary/10 z-20">#</th>
              <th rowSpan={2} className="p-2 w-36 text-left font-bold text-primary border-r border-b border-primary/20">Area Name</th>
              <th rowSpan={2} className="p-2 w-28 text-left font-bold text-primary border-r border-b border-primary/20">Brand</th>
              <th rowSpan={2} className="p-2 w-44 text-left font-bold text-primary border-r border-b border-primary/20">Type</th>
              <th rowSpan={2} className="p-2 w-28 text-left font-bold text-primary border-r border-b border-primary/20">System</th>
              <th rowSpan={2} className="p-2 w-28 text-left font-bold text-primary border-r border-b border-primary/20">Style</th>
              <th colSpan={4} className="p-2 text-center font-bold text-primary border-r border-b border-primary/20 bg-orange-50">Collection & Shade/SRL <span className="text-[10px] font-normal">(Honeycomb D/N uses both Top + Bottom)</span></th>
              <th rowSpan={2} className="p-2 w-16 text-left font-bold text-primary border-r border-b border-primary/20">Unit</th>
              <th rowSpan={2} className="p-2 w-20 text-left font-bold text-primary border-r border-b border-primary/20">W</th>
              <th rowSpan={2} className="p-2 w-20 text-left font-bold text-primary border-r border-b border-primary/20">H</th>
              <th rowSpan={2} className="p-2 w-28 text-left font-bold text-primary border-r border-b border-primary/20">Fitting</th>
              <th rowSpan={2} className="p-2 w-28 text-left font-bold text-primary border-r border-b border-primary/20">Ladder Tap</th>
              <th rowSpan={2} className="p-2 w-24 text-left font-bold text-primary border-r border-b border-primary/20">Operation</th>
              <th colSpan={4} className="p-2 text-center font-bold text-primary border-r border-b border-primary/20 bg-yellow-100">If Motorised</th>
              <th rowSpan={2} className="p-2 w-20 text-left font-bold text-primary border-r border-b border-primary/20">Qty</th>
              <th rowSpan={2} className="p-2 w-40 text-left font-bold text-primary border-r border-b border-primary/20">Remark</th>
              <th rowSpan={2} className="p-2 w-10 sticky right-0 bg-primary/10 z-20 border-b border-primary/20"></th>
            </tr>
            <tr>
              <th className="p-1 w-32 text-left font-semibold text-primary border-r border-b border-primary/20 bg-orange-50/60 text-xs">Collection (Top)</th>
              <th className="p-1 w-28 text-left font-semibold text-primary border-r border-b border-primary/20 bg-orange-50/60 text-xs">Shade/SRL (Top)</th>
              <th className="p-1 w-32 text-left font-semibold text-primary border-r border-b border-primary/20 bg-orange-50/60 text-xs">Collection (Bottom)</th>
              <th className="p-1 w-28 text-left font-semibold text-primary border-r border-b border-primary/20 bg-orange-50/60 text-xs">Shade/SRL (Bottom)</th>
              <th className="p-1 w-28 text-left font-semibold text-primary border-r border-b border-primary/20 bg-yellow-50 text-xs">Motorization</th>
              <th className="p-1 w-28 text-left font-semibold text-primary border-r border-b border-primary/20 bg-yellow-50 text-xs">Motor</th>
              <th className="p-1 w-28 text-left font-semibold text-primary border-r border-b border-primary/20 bg-yellow-50 text-xs">Remote</th>
              <th className="p-1 w-24 text-left font-semibold text-primary border-r border-b border-primary/20 bg-yellow-50 text-xs">Wire</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, idx) => {
              const isManual = row.system === 'Manual';
              const isMotorised = row.system === 'Motorised';
              const isDN = row.type === 'Honeycomb' && row.style === 'D/N';
              const isDNMotor = isDN && isMotorised;
              const isWoodenVenetian = row.type === 'Wooden Venetian';
              const isInsideFitting = row.fitting === 'Inside';
              const styleOptions = STYLE_OPTIONS_BY_TYPE[row.type] || [];
              const motorizationOptions = isDNMotor ? MOTORIZATION_OPTIONS_DN : MOTORIZATION_OPTIONS_ALL;

              const operationClass = `p-1 border-r ${!isManual ? 'bg-gray-50 opacity-50' : ''}`;
              const motorClass = `p-1 border-r ${!isMotorised ? 'bg-gray-50 opacity-50' : 'bg-yellow-50/30'}`;
              const dnClass = `p-1 border-r ${!isDN ? 'bg-gray-50 opacity-50' : 'bg-orange-50/30'}`;
              const ladderClass = `p-1 border-r ${!isWoodenVenetian ? 'bg-gray-50 opacity-50' : ''}`;

              return (
                <tr key={row.uid} className="group hover:bg-primary/5 transition-colors">
                  <td className="p-1 text-center text-xs text-muted-foreground border-r bg-muted/10 font-bold sticky left-0 z-10">{idx + 1}</td>

                  {/* Area */}
                  <td className="p-1 border-r">
                    <input
                      list={`blind-area-${row.uid}`}
                      value={row.areaName}
                      onChange={(e) => updateRow(idx, 'areaName', e.target.value)}
                      className="w-full h-9 px-2 text-xs border-transparent bg-transparent focus:bg-white focus:border-primary rounded"
                      placeholder="Area Name"
                    />
                    <datalist id={`blind-area-${row.uid}`}>
                      {COMMON_AREAS.map(area => <option key={area} value={area} />)}
                    </datalist>
                  </td>

                  {/* Brand */}
                  <td className="p-1 border-r">
                    <select value={row.brand} onChange={(e) => updateRow(idx, 'brand', e.target.value)} className="w-full h-9 px-1 text-xs border-transparent bg-transparent focus:bg-white rounded">
                      <option value="">-</option>
                      {BRAND_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </td>

                  {/* Type */}
                  <td className="p-1 border-r">
                    <select value={row.type} onChange={(e) => updateRow(idx, 'type', e.target.value)} className="w-full h-9 px-1 text-xs border-transparent bg-transparent focus:bg-white rounded">
                      <option value="">-</option>
                      {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>

                  {/* System */}
                  <td className="p-1 border-r">
                    <select value={row.system} onChange={(e) => updateRow(idx, 'system', e.target.value)} className="w-full h-9 px-1 text-xs border-transparent bg-transparent focus:bg-white rounded">
                      <option value="">-</option>
                      {SYSTEM_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>

                  {/* Style — options depend on Type */}
                  <td className="p-1 border-r">
                    <select
                      value={row.style}
                      onChange={(e) => updateRow(idx, 'style', e.target.value)}
                      disabled={!row.type}
                      className="w-full h-9 px-1 text-xs border-transparent bg-transparent focus:bg-white rounded disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">-</option>
                      {styleOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>

                  {/* Collection (single OR Top for D/N) */}
                  <td className="p-1 border-r">
                    <input
                      type="text"
                      value={isDN ? row.collectionTop : row.collection}
                      onChange={(e) => updateRow(idx, isDN ? 'collectionTop' : 'collection', e.target.value)}
                      className="w-full h-9 px-2 text-xs border-transparent bg-transparent focus:bg-white rounded"
                      placeholder={isDN ? 'Top' : ''}
                    />
                  </td>

                  {/* Shade / SRL (single OR Top for D/N) */}
                  <td className="p-1 border-r">
                    <input
                      type="text"
                      value={isDN ? row.shadeSRLTop : row.shadeSRL}
                      onChange={(e) => updateRow(idx, isDN ? 'shadeSRLTop' : 'shadeSRL', e.target.value)}
                      className="w-full h-9 px-2 text-xs border-transparent bg-transparent focus:bg-white rounded"
                      placeholder={isDN ? 'Top SRL' : 'SRL'}
                    />
                  </td>

                  {/* Collection (Bottom) — D/N only */}
                  <td className={dnClass}>
                    <input
                      type="text"
                      value={row.collectionBottom}
                      onChange={(e) => updateRow(idx, 'collectionBottom', e.target.value)}
                      disabled={!isDN}
                      className="w-full h-9 px-2 text-xs border-transparent bg-transparent focus:bg-white rounded disabled:cursor-not-allowed"
                      placeholder="Bottom"
                    />
                  </td>

                  {/* Shade (Bottom) — D/N only */}
                  <td className={dnClass}>
                    <input
                      type="text"
                      value={row.shadeSRLBottom}
                      onChange={(e) => updateRow(idx, 'shadeSRLBottom', e.target.value)}
                      disabled={!isDN}
                      className="w-full h-9 px-2 text-xs border-transparent bg-transparent focus:bg-white rounded disabled:cursor-not-allowed"
                      placeholder="Bottom SRL"
                    />
                  </td>

                  {/* Unit */}
                  <td className="p-1 border-r">
                    <select value={row.unit} onChange={(e) => updateRow(idx, 'unit', e.target.value)} className="w-full h-9 px-1 text-xs border-transparent bg-transparent focus:bg-white rounded">
                      {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>

                  {/* Width */}
                  <td className="p-1 border-r">
                    <input type="number" step="0.01" value={row.width} onChange={(e) => updateRow(idx, 'width', e.target.value)} className="w-full h-9 px-2 text-xs text-right border-transparent bg-transparent focus:bg-white rounded" />
                  </td>

                  {/* Height */}
                  <td className="p-1 border-r">
                    <input type="number" step="0.01" value={row.height} onChange={(e) => updateRow(idx, 'height', e.target.value)} className="w-full h-9 px-2 text-xs text-right border-transparent bg-transparent focus:bg-white rounded" />
                  </td>

                  {/* Fitting — universal (Manual + Motorised) */}
                  <td className="p-1 border-r">
                    <select
                      value={row.fitting}
                      onChange={(e) => updateRow(idx, 'fitting', e.target.value)}
                      className={`w-full h-9 px-1 text-xs bg-transparent border-transparent focus:bg-white rounded ${isInsideFitting ? 'text-orange-700 font-semibold' : ''}`}
                      title={isInsideFitting ? 'Inside fitting: actual blind will be 1 cm less than measured width' : ''}
                    >
                      <option value="">-</option>
                      {FITTING_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    {isInsideFitting && (
                      <div className="mt-0.5 text-[10px] font-semibold text-orange-700 bg-orange-100 border border-orange-300 rounded px-1 py-0.5 text-center" title="Inside fitting: actual blind will be 1 cm less than measured width">
                        − 1 cm width
                      </div>
                    )}
                  </td>

                  {/* Ladder Tap — only enabled when Type = Wooden Venetian (regardless of System) */}
                  <td className={ladderClass}>
                    <input
                      type="text"
                      value={row.ladderTap}
                      onChange={(e) => updateRow(idx, 'ladderTap', e.target.value)}
                      disabled={!isWoodenVenetian}
                      className="w-full h-9 px-2 text-xs bg-transparent border-transparent focus:bg-white rounded disabled:cursor-not-allowed"
                      placeholder={isWoodenVenetian ? 'Ladder Tap' : '-'}
                    />
                  </td>

                  {/* Operation — Manual only */}
                  <td className={operationClass}>
                    <select value={row.operation} onChange={(e) => updateRow(idx, 'operation', e.target.value)} disabled={!isManual} className="w-full h-9 px-1 text-xs bg-transparent border-transparent focus:bg-white rounded disabled:cursor-not-allowed">
                      <option value="">-</option>
                      {OPERATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>

                  {/* Motorization — Motorised only (restricted to 'Remote' for Honeycomb D/N) */}
                  <td className={motorClass}>
                    <select value={row.motorization} onChange={(e) => updateRow(idx, 'motorization', e.target.value)} disabled={!isMotorised} className="w-full h-9 px-1 text-xs bg-transparent border-transparent focus:bg-white rounded disabled:cursor-not-allowed">
                      <option value="">-</option>
                      {motorizationOptions.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {isDNMotor && (
                      <div className="mt-0.5 text-[9px] text-yellow-700 italic">D/N: Remote only</div>
                    )}
                  </td>

                  {/* Motor — Motorised only */}
                  <td className={motorClass}>
                    <input type="text" value={row.motor} onChange={(e) => updateRow(idx, 'motor', e.target.value)} disabled={!isMotorised} className="w-full h-9 px-2 text-xs bg-transparent border-transparent focus:bg-white rounded disabled:cursor-not-allowed" placeholder="Motor model" />
                  </td>

                  {/* Remote — Motorised only */}
                  <td className={motorClass}>
                    <input type="text" value={row.remote} onChange={(e) => updateRow(idx, 'remote', e.target.value)} disabled={!isMotorised} className="w-full h-9 px-2 text-xs bg-transparent border-transparent focus:bg-white rounded disabled:cursor-not-allowed" placeholder="Remote model" />
                  </td>

                  {/* Wire — Motorised only */}
                  <td className={motorClass}>
                    <select value={row.wire} onChange={(e) => updateRow(idx, 'wire', e.target.value)} disabled={!isMotorised} className="w-full h-9 px-1 text-xs bg-transparent border-transparent focus:bg-white rounded disabled:cursor-not-allowed">
                      <option value="">-</option>
                      {WIRE_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </td>

                  {/* Qty — auto-defaults to 1 on new row */}
                  <td className="p-1 border-r">
                    <input type="number" min={1} step={1} value={row.quantity} onChange={(e) => updateRow(idx, 'quantity', parseInt(e.target.value) || 1)} className="w-full h-9 px-2 text-xs text-right border-transparent bg-transparent focus:bg-white rounded" />
                  </td>

                  {/* Remark */}
                  <td className="p-1 border-r">
                    <input type="text" value={row.remark} onChange={(e) => updateRow(idx, 'remark', e.target.value)} className="w-full h-9 px-2 text-xs border-transparent bg-transparent focus:bg-white rounded" placeholder="Notes..." />
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

      <div className="p-4 border-t flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
        <Button type="button" variant="outline" onClick={handleAddRow} className="w-full sm:w-auto gap-2 border-dashed border-2">
          <Plus className="h-4 w-4" /> Add Blind Row
        </Button>
        <div className="flex items-center justify-between w-full sm:w-auto gap-6 text-sm text-muted-foreground">
          <div>Total Blinds: <span className="text-foreground font-bold">{rows.length}</span></div>
        </div>
      </div>
    </div>
  );
};

export default BlindsTable;
