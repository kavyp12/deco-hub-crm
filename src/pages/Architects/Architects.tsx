import React, { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Mail, Phone, Calendar } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Architect {
  id: string;
  name: string;
  address: string;
  contact: string;
  email: string;
  birth_date: string | null;
  anniversary_date: string | null;
  associate_arch_name: string | null;
}

const Architects: React.FC = () => {
  const { toast } = useToast();
  const [architects, setArchitects] = useState<Architect[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal States
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [currentArch, setCurrentArch] = useState<Architect | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    contact: '',
    email: '',
    birth_date: '',
    anniversary_date: '',
    associate_arch_name: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/architects');
      setArchitects(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '', address: '', contact: '', email: '', 
      birth_date: '', anniversary_date: '', associate_arch_name: ''
    });
    setCurrentArch(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (arch: Architect) => {
    setCurrentArch(arch);
    setFormData({
      name: arch.name,
      address: arch.address || '',
      contact: arch.contact || '',
      email: arch.email || '',
      birth_date: arch.birth_date ? arch.birth_date.split('T')[0] : '',
      anniversary_date: arch.anniversary_date ? arch.anniversary_date.split('T')[0] : '',
      associate_arch_name: arch.associate_arch_name || ''
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      if (currentArch) {
        await api.put(`/architects/${currentArch.id}`, formData);
        toast({ title: 'Success', description: 'Architect updated successfully' });
      } else {
        await api.post('/architects', formData);
        toast({ title: 'Success', description: 'Architect created successfully' });
      }
      setIsDialogOpen(false);
      fetchData();
    } catch (error) {
      toast({ title: 'Error', description: 'Operation failed', variant: 'destructive' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!currentArch) return;
    setFormLoading(true);
    try {
      await api.delete(`/architects/${currentArch.id}`);
      toast({ title: 'Deleted', description: 'Architect removed' });
      setIsDeleteOpen(false);
      fetchData();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    } finally {
      setFormLoading(false);
    }
  };

  const filtered = architects.filter(a => 
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.contact?.includes(searchQuery)
  );

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Architects</h1>
            <p className="text-muted-foreground">Manage architects and interior designers</p>
          </div>
          <Button onClick={handleOpenCreate} variant="accent" className="w-full md:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Add Architect
          </Button>
        </div>

        {/* Search */}
        <div className="card-premium p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name or contact..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading ? <p>Loading...</p> : filtered.map(arch => (
                <div key={arch.id} className="card-premium p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-bold text-lg">{arch.name}</h3>
                            {arch.associate_arch_name && (
                                <p className="text-xs text-muted-foreground">Assoc: {arch.associate_arch_name}</p>
                            )}
                        </div>
                        <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(arch)}>
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setCurrentArch(arch); setIsDeleteOpen(true); }}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    
                    <div className="space-y-1 text-sm text-muted-foreground">
                        {arch.contact && <div className="flex items-center gap-2"><Phone className="h-3 w-3" /> {arch.contact}</div>}
                        {arch.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3" /> {arch.email}</div>}
                        {arch.birth_date && (
                             <div className="flex items-center gap-2 text-primary">
                                <Calendar className="h-3 w-3" /> Birth: {format(new Date(arch.birth_date), 'dd MMM')}
                             </div>
                        )}
                         {arch.anniversary_date && (
                             <div className="flex items-center gap-2 text-primary">
                                <Calendar className="h-3 w-3" /> Anniversary: {format(new Date(arch.anniversary_date), 'dd MMM')}
                             </div>
                        )}
                    </div>
                </div>
            ))}
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{currentArch ? 'Edit Architect' : 'New Architect'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Associate Architect Name</Label>
                <Input value={formData.associate_arch_name} onChange={e => setFormData({...formData, associate_arch_name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Contact Number</Label>
                <Input value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Birth Date</Label>
                <Input type="date" value={formData.birth_date} onChange={e => setFormData({...formData, birth_date: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Anniversary Date</Label>
                <Input type="date" value={formData.anniversary_date} onChange={e => setFormData({...formData, anniversary_date: e.target.value})} />
              </div>
              <div className="col-span-1 md:col-span-2 space-y-2">
                <Label>Address</Label>
                <Input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
              </div>
              
              <div className="col-span-1 md:col-span-2 flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" variant="accent" disabled={formLoading}>Save</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
           <DialogContent>
               <DialogHeader><DialogTitle>Delete Architect</DialogTitle></DialogHeader>
               <DialogDescription>Are you sure? This cannot be undone.</DialogDescription>
               <DialogFooter>
                   <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
                   <Button variant="destructive" onClick={handleDelete} disabled={formLoading}>Delete</Button>
               </DialogFooter>
           </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
};

export default Architects;