import express, { Request, Response } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv'; 
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import * as xlsx from 'xlsx';
import { authenticateToken, requireRole } from './middleware/authMiddleware';

dotenv.config();
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({
  origin: true, // Allow connections
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: true
}));



app.use(express.json());


const calculateRow = (item: any) => {
  const qty = parseFloat(item.quantity) || 0;
  const rate = parseFloat(item.unitPrice) || 0;
  const baseTotal = qty * rate;
  
  const discPct = parseFloat(item.discountPercent) || 0;
  const discAmt = baseTotal * (discPct / 100);
  
  const taxable = baseTotal - discAmt;
  
  const gstPct = parseFloat(item.gstPercent) || 0;
  const gstAmt = taxable * (gstPct / 100);
  
  return {
    discountAmount: discAmt,
    gstAmount: gstAmt,
    total: taxable + gstAmt
  };
};
// ==========================================
// 1. AUTH ROUTES
// ==========================================

app.post('/api/auth/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(400).json({ error: 'User not found' });
      return;
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      res.status(400).json({ error: 'Invalid password' });
      return;
    }
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    const { password: _, ...userInfo } = user;
    res.json({ token, user: userInfo });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req: any, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const { password: _, ...userInfo } = user;
    res.json(userInfo);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==========================================
// 2. EMPLOYEE ROUTES
// ==========================================

app.post('/api/employees', authenticateToken, requireRole(['super_admin']), async (req: Request, res: Response) => {
  const { name, email, password, mobile_number, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: { name, email, password: hashedPassword, mobile_number, role },
    });
    const { password: _, ...userInfo } = newUser;
    res.json(userInfo);
  } catch (error) {
    res.status(400).json({ error: 'Email likely already exists' });
  }
});

app.get('/api/employees', authenticateToken, requireRole(['super_admin', 'admin_hr']), async (req: Request, res: Response) => {
  try {
    const employees = await prisma.user.findMany({
      orderBy: { created_at: 'desc' },
      select: { id: true, name: true, email: true, mobile_number: true, role: true, created_at: true }
    });
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

app.put('/api/employees/:id', authenticateToken, requireRole(['super_admin']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, mobile_number, role } = req.body;
  try {
    const updated = await prisma.user.update({
      where: { id },
      data: { name, mobile_number, role },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

app.delete('/api/employees/:id', authenticateToken, requireRole(['super_admin']), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

app.get('/api/users/sales-people', authenticateToken, async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ['sales', 'super_admin'] } },
      select: { id: true, name: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching sales people' });
  }
});

// ==========================================
// 3. CATALOG & COMPANY ROUTES
// ==========================================

app.get('/api/companies', authenticateToken, async (req: Request, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      include: { catalogs: true },
      orderBy: { name: 'asc' }
    });
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

app.post('/api/companies', authenticateToken, requireRole(['super_admin', 'admin_hr']), async (req: Request, res: Response) => {
  try {
    const company = await prisma.company.create({ data: { name: req.body.name } });
    res.json(company);
  } catch (error) {
    res.status(400).json({ error: 'Company likely already exists' });
  }
});

app.delete('/api/companies/:id', authenticateToken, requireRole(['super_admin']), async (req: Request, res: Response) => {
  try {
    await prisma.company.delete({ where: { id: req.params.id } });
    res.json({ message: 'Company and all data deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete company' }); }
});

app.post('/api/upload-catalog', authenticateToken, requireRole(['super_admin', 'admin_hr']), upload.single('file'), async (req: any, res: Response): Promise<void> => {
  if (!req.file) { 
    res.status(400).json({ error: 'No file uploaded' }); 
    return; 
  }
  
  const { companyId, defaultType } = req.body;

  try {
    const workbook = xlsx.read(req.file.buffer, { 
      type: 'buffer',
      cellText: true,
      raw: false
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const data: any[] = xlsx.utils.sheet_to_json(worksheet, { 
      raw: false,
      defval: '',
      blankrows: false
    });

    if (data.length === 0) { 
      res.status(400).json({ error: 'Excel sheet is empty' }); 
      return; 
    }

    let productsCreated = 0;
    const errors: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2;

      const collection = row['Collection']?.toString().trim();
      const designCode = row['Design Name']?.toString().trim() || row['Design']?.toString().trim();
      const rrPriceRaw = row['RR Price after GST (Cut Rate)']?.toString().trim() || 
                         row[' RR Price after GST (Cut Rate) ']?.toString().trim();

      if (!collection) {
        errors.push(`Row ${rowNumber}: Missing Collection`);
        continue;
      }
      if (!designCode) {
        errors.push(`Row ${rowNumber}: Missing Design Name/Code`);
        continue;
      }
      if (!rrPriceRaw) {
        errors.push(`Row ${rowNumber}: Missing RR Price after GST (Cut Rate)`);
        continue;
      }

      const priceString = rrPriceRaw
        .replace(/₹/g, '')
        .replace(/\s+/g, '')
        .trim();

      if (!priceString || priceString === '') {
        errors.push(`Row ${rowNumber}: Invalid price "${rrPriceRaw}"`);
        continue;
      }

      let catalog = await prisma.catalog.findFirst({ 
        where: { 
          name: collection, 
          companyId 
        } 
      });
      
      if (!catalog) {
        catalog = await prisma.catalog.create({
          data: { 
            name: collection, 
            companyId, 
            type: defaultType || 'Curtains'
          }
        });
      }

      const attributes: any = {};
      
      for (const columnName in row) {
        if (
          columnName === 'Collection' ||
          columnName === 'Design Name' ||
          columnName === 'Design' ||
          columnName === 'RR Price after GST (Cut Rate)' ||
          columnName === ' RR Price after GST (Cut Rate) '
        ) {
          continue;
        }
        
        const value = row[columnName];
        if (value !== undefined && value !== null && value !== '') {
          attributes[columnName.trim()] = String(value).trim();
        }
      }

      try {
        await prisma.product.create({
          data: {
            name: designCode,
            price: priceString,
            catalogId: catalog.id,
            attributes: attributes,
          }
        });
        productsCreated++;
      } catch (err) {
        errors.push(`Row ${rowNumber}: Failed to create product "${designCode}"`);
      }
    }

    const response: any = {
      success: true,
      message: `Successfully processed ${productsCreated} products`,
      productsCreated,
      totalRows: data.length
    };

    if (errors.length > 0) {
      response.errors = errors;
      response.message += ` (${errors.length} errors)`;
    }

    res.json(response);
    
  } catch (error) {
    console.error('Excel processing error:', error);
    res.status(500).json({ 
      error: 'Failed to process Excel file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
// [FILE: index.ts] - Add this missing route

app.get('/api/catalogs/:id/products', authenticateToken, async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      where: { catalogId: req.params.id },
      include: { 
        catalog: { 
          select: { 
            id: true, 
            name: true, 
            type: true, // Included so frontend knows if it's Curtains/Rugs
            companyId: true 
          } 
        } 
      },
      orderBy: { name: 'asc' }
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products for catalog' });
  }
});
app.get('/api/products/all', authenticateToken, async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      include: { 
        catalog: { 
          select: { 
            id: true,          // <--- ADDED THIS
            name: true, 
            type: true,
            companyId: true,   // <--- ADDED THIS
            company: { 
              select: { 
                id: true,      // <--- ADDED THIS
                name: true 
              } 
            }
          } 
        } 
      },
      orderBy: [
        { catalog: { company: { name: 'asc' } } },
        { catalog: { name: 'asc' } },
        { name: 'asc' }
      ]
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});
app.put('/api/products/:id', authenticateToken, requireRole(['super_admin', 'admin_hr']), async (req: Request, res: Response) => {
  const { price, imageUrl, name } = req.body;
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { 
        price: price, 
        imageUrl, 
        name 
      }
    });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// ==========================================
// 4. INQUIRY ROUTES
// ==========================================

app.get('/api/inquiries', authenticateToken, async (req: Request, res: Response) => {
  try {
    const inquiries = await prisma.inquiry.findMany({
      include: { 
        sales_person: { select: { name: true } },
        selections: { select: { id: true, selection_number: true, status: true } }
      },
      orderBy: { created_at: 'desc' }
    });
    const formatted = inquiries.map((i: any) => ({ 
      ...i, 
      profiles: i.sales_person 
    }));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inquiries' });
  }
});

app.post('/api/inquiries', authenticateToken, async (req: any, res: Response) => {
  // REMOVED product_category from destructuring
  const { 
    client_name, architect_id_name, mobile_number, inquiry_date, address, 
    sales_person_id, expected_final_date
  } = req.body;
  
  try {
    const date = new Date();
    const yearMonth = `${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    
    const counterRecord = await prisma.inquiryCounter.upsert({
      where: { year_month: yearMonth },
      update: { counter: { increment: 1 } },
      create: { year_month: yearMonth, counter: 1 },
    });
    
    const inquiryNumber = `INQ-${yearMonth}${counterRecord.counter.toString().padStart(4, '0')}`;

    const newInquiry = await prisma.inquiry.create({
      data: {
        inquiry_number: inquiryNumber,
        client_name,
        architect_id_name,
        mobile_number,
        inquiry_date: new Date(inquiry_date),
        address,
        sales_person_id,
        expected_final_date: expected_final_date ? new Date(expected_final_date) : null,
        // product_category removed
        created_by_id: req.user.id,
      }
    });
    
    res.json(newInquiry);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create inquiry' });
  }
});

app.put('/api/inquiries/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body;

  if (data.inquiry_date) {
      data.inquiry_date = new Date(data.inquiry_date);
  }
  
  if (data.expected_final_date && data.expected_final_date !== '') {
      data.expected_final_date = new Date(data.expected_final_date);
  } else {
      data.expected_final_date = null;
  }
  
  // Clean up data object if it contains product_category by accident
  delete data.product_category;

  try {
    const updated = await prisma.inquiry.update({ where: { id }, data: data });
    res.json(updated);
  } catch (error) {
    console.error('Update Error:', error);
    res.status(500).json({ error: 'Failed to update inquiry' });
  }
});

app.delete('/api/inquiries/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await prisma.selection.deleteMany({ where: { inquiryId: id } });
    await prisma.inquiry.delete({ where: { id } });
    res.json({ message: 'Deleted inquiry and associated records' });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({ error: 'Failed to delete inquiry' });
  }
});
// 5. SELECTION ROUTES
// ==========================================
app.get('/api/selections', authenticateToken, async (req: Request, res: Response) => {
  try {
    const selections = await prisma.selection.findMany({
      include: {
        inquiry: {
          include: {
            sales_person: { select: { name: true } }
          }
        },
        items: {
          orderBy: { orderIndex: 'asc' } // ✅ ADD THIS
        },
        created_by: { select: { name: true } }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(selections);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch selections' });
  }
});
app.get('/api/selections/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const selection = await prisma.selection.findUnique({
      where: { id: req.params.id },
      include: {
        inquiry: {
          include: {
            sales_person: { select: { name: true } }
          }
        },
        items: {
          include: { product: true }, // <--- 🔥 THIS WAS MISSING. ADD IT!
          orderBy: { orderIndex: 'asc' }
        },
        created_by: { select: { name: true } }
      }
    });
    res.json(selection);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch selection' });
  }
});

app.get('/api/selections/by-inquiry/:inquiryId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const selection = await prisma.selection.findFirst({
      where: { inquiryId: req.params.inquiryId },
      include: {
        inquiry: {
          include: {
            sales_person: { select: { name: true } }
          }
        },
        items: {
          orderBy: { orderIndex: 'asc' } // ✅ ADD THIS
        },
        created_by: { select: { name: true } }
      }
    });
    res.json(selection);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch selection' });
  }
});
app.post('/api/selections', authenticateToken, async (req: any, res: Response) => {
  const { inquiryId, delivery_date, notes, items, status } = req.body;
  
  try {
    console.log('📥 Creating New Selection:', { 
      inquiryId, 
      itemsCount: items?.length,
      items: items?.map((i: any) => ({ 
        productName: i.productName || i.name, 
        calculationType: i.calculationType 
      }))
    });
    
    const date = new Date();
    const yearMonth = `${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    
    const counterRecord = await prisma.selectionCounter.upsert({
      where: { year_month: yearMonth },
      update: { counter: { increment: 1 } },
      create: { year_month: yearMonth, counter: 1 },
    });
    
    const selectionNumber = `SEL-${yearMonth}${counterRecord.counter.toString().padStart(4, '0')}`;

    const mapItem = (item: any, index: number) => {
  // ✅ Ensure calculationType is always set and supports all types
  const calculationType = item.calculationType || 'Local';
  
  console.log(`✅ Mapping Item ${index + 1}:`, {
    productName: item.name || item.productName,
    calculationType: calculationType
  });
  
  return {
    productId: item.id || item.productId || null,
    productName: item.name || item.productName || 'Custom Item',
    quantity: parseFloat(item.quantity) || 1,
    price: parseFloat(item.price) || 0,
    total: (parseFloat(item.quantity) || 1) * (parseFloat(item.price) || 0),
    
    // ✅ Accept new calculation types including "Forest (Manual)" and "Forest (Auto)"
    calculationType: calculationType,

    unit: item.unit || 'mm',
    width: item.width ? parseFloat(item.width) : null,
    height: item.height ? parseFloat(item.height) : null,
    type: item.type || null,
    motorizationMode: item.motorizationMode || null,
    opsType: item.opsType || null,
    pelmet: item.pelmet ? parseFloat(item.pelmet) : null,
    openingType: item.openingType || null,
    
    orderIndex: index,
    
    details: {
      ...(item.attributes || {}),
      ...(item.details || {}),
      areaName: item.areaName || item.details?.areaName || '',
      catalogName: item.catalogName || item.details?.catalogName || '',
      catalogType: item.catalogType || item.details?.catalogType || ''
    }
  };
};

    const newSelection = await prisma.selection.create({
      data: {
        selection_number: selectionNumber,
        inquiryId,
        status: status || 'pending',
        delivery_date: delivery_date ? new Date(delivery_date) : null,
        notes,
        created_by_id: req.user.id,
        items: {
          create: items.map(mapItem)
        }
      },
      include: { items: true, inquiry: true }
    });
    
    console.log('✅ Selection Created Successfully:', {
      selectionNumber: newSelection.selection_number,
      itemsCount: newSelection.items.length,
      calculationTypes: newSelection.items.map(i => i.calculationType)
    });
    
    res.json(newSelection);
  } catch (error) {
    console.error('❌ Selection creation error:', error);
    res.status(500).json({ error: 'Failed to create selection' });
  }
});
// [In src/index.ts]

app.put('/api/selections/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, delivery_date, notes, items } = req.body;
  
  try {
    console.log('🔥 Received Update Request:', { 
      selectionId: id, 
      itemsCount: items?.length 
    });

    // ==================================================================
    // 🛡️ STEP 0: VALIDATE PRODUCT IDs (CRITICAL FIX)
    // We check which IDs actually exist in the Product table.
    // Any ID sent by frontend that isn't in this list will be set to NULL.
    // ==================================================================
    let validProductIds = new Set<string>();

    if (items && Array.isArray(items)) {
      // 1. Extract all potential UUIDs from the request
      const potentialIds = items
        .map((i: any) => i.productId)
        .filter((pid: any) => 
          pid && 
          typeof pid === 'string' && 
          !pid.startsWith('temp-') && 
          pid !== 'manual'
        );

      if (potentialIds.length > 0) {
        // 2. Query DB to see which ones are real Products
        const foundProducts = await prisma.product.findMany({
          where: { id: { in: potentialIds } },
          select: { id: true }
        });
        
        // 3. Create a Set for fast lookup
        foundProducts.forEach(p => validProductIds.add(p.id));
      }
    }
    // ==================================================================
    
    // STEP 1: Fetch existing items to preserve calculation types if needed
    const existingSelection = await prisma.selection.findUnique({
      where: { id },
      include: { items: true }
    });

    const calcTypeMap = new Map<string, string>();
    if (existingSelection) {
      existingSelection.items.forEach(item => {
        const productKey = item.productId || 'manual';
        const areaKey = item.details && typeof item.details === 'object' && 'areaName' in item.details 
          ? String(item.details.areaName) 
          : '';
        const key = `${productKey}:${areaKey}`;
        calcTypeMap.set(key, item.calculationType);
      });
    }

    // STEP 2: Delete ALL existing items
    await prisma.selectionItem.deleteMany({
      where: { selectionId: id }
    });

    // STEP 3: Recreate items with VALIDATED productId
    if (items && Array.isArray(items)) {
      const itemsToCreate = items.map((item: any, index: number) => {
        
        // Logic to restore calculation type
        const rawProductId = (item.productId && !String(item.productId).startsWith('temp-')) ? item.productId : 'manual';
        const areaKey = item.details?.areaName || item.areaName || '';
        const matchKey = `${rawProductId}:${areaKey}`;
        const calculationType = item.calculationType || calcTypeMap.get(matchKey) || 'Local';
        
        const finalOrderIndex = item.orderIndex !== undefined ? item.orderIndex : index;

        // 🔥 FINAL CHECK: Only use productId if it was found in the DB in Step 0
        const dbSafeProductId = (item.productId && validProductIds.has(item.productId)) 
          ? item.productId 
          : null;

        return {
          selectionId: id,
          
          // ✅ SAFE: Only real Product IDs get passed. Everything else becomes null.
          productId: dbSafeProductId,
            
          productName: item.productName || 'Custom Item',
          quantity: parseFloat(String(item.quantity)) || 1,
          price: parseFloat(String(item.price)) || 0,
          total: (parseFloat(String(item.quantity)) || 1) * (parseFloat(String(item.price)) || 0),
          
          calculationType: calculationType,
          
          unit: item.unit || 'mm',
          width: item.width ? parseFloat(String(item.width)) : null,
          height: item.height ? parseFloat(String(item.height)) : null,
          type: item.type || null,
          motorizationMode: item.motorizationMode || null,
          opsType: item.opsType || null,
          pelmet: item.pelmet ? parseFloat(String(item.pelmet)) : null,
          openingType: item.openingType || null,
          
          orderIndex: finalOrderIndex,
          
          details: {
            areaName: item.details?.areaName || item.areaName || 'Unknown Area',
            catalogName: item.details?.catalogName || item.catalogName || '',
            catalogType: item.details?.catalogType || item.catalogType || '',
            companyId: item.details?.companyId || item.companyId || '', // Persist Company ID
            ...(item.details || {})
          }
        };
      });
      
      await prisma.selectionItem.createMany({
        data: itemsToCreate
      });
    }

    // STEP 4: Update selection metadata
    await prisma.selection.update({
      where: { id },
      data: {
        status: status || 'pending',
        delivery_date: delivery_date ? new Date(delivery_date) : null,
        notes: notes || null
      }
    });

    // STEP 5: Return updated selection
    const updated = await prisma.selection.findUnique({
      where: { id },
      include: { 
        items: {
          orderBy: { orderIndex: 'asc' } 
        }, 
        inquiry: true 
      }
    });
    
    res.json(updated);
    
  } catch (error) {
    console.error('❌ Selection update error:', error);
    res.status(500).json({ error: 'Failed to update selection' });
  }
});
app.delete('/api/selections/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    await prisma.selection.delete({ where: { id: req.params.id } });
    res.json({ message: 'Selection deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete selection' });
  }
});



// caculation

// --- CALCULATION ROUTES ---

// 1. Get All Calculations (List View)
app.get('/api/calculations', authenticateToken, async (req: Request, res: Response) => {
  try {
    const calculations = await prisma.calculation.findMany({
      include: {
        selection: {
          include: {
            inquiry: { select: { client_name: true, inquiry_number: true } }
          }
        },
        items: true
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(calculations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch calculations' });
  }
});
app.get('/api/calculations/by-selection/:selectionId', authenticateToken, async (req: Request, res: Response) => {
  const { selectionId } = req.params;
  try {
    const existing = await prisma.calculation.findFirst({
      where: { selectionId },
      include: { 
        items: {
          include: {
            selectionItem: {
              include: { product: true }
            }
          },
          orderBy: {
            selectionItem: { orderIndex: 'asc' }  // ← ADD THIS
          }
        } 
      }
    });

    if (existing) {
      res.json(existing);
      return;
    }

    res.json(null);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching calculation' });
  }
});
app.post('/api/calculations', authenticateToken, async (req: any, res: Response) => {
  const { selectionId, items, category } = req.body;

  const targetCategory = category || (items.length > 0 ? items[0].category : null);

  if (!targetCategory) {
     res.status(400).json({ error: "Category is required to save calculation" });
     return;
  }

  try {
    // 1. Sync Measurements
    const updatePromises = items.map((item: any) => 
      prisma.selectionItem.update({
        where: { id: item.selectionItemId },
        data: {
          width: parseFloat(item.width),
          height: parseFloat(item.height),
          unit: item.unit
        }
      })
    );
    await Promise.all(updatePromises);

    // 2. Save Calculation
    const calculation = await prisma.calculation.upsert({
      where: { selectionId },
      update: {
        items: {
          deleteMany: { category: targetCategory }, 
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            category: item.category || 'Standard',
            type: item.type || 'Local',
            
            // Dimensions / Quantities
            part: parseFloat(item.part || 0),
            panna: parseFloat(item.panna || 0),
            fabric: parseFloat(item.fabric || 0),
            channel: parseFloat(item.channel || 0),
            sqft: parseFloat(item.sqft || 0),
            
            // ✅ FIX: ADDED MISSING RATE FIELDS HERE
            sqftRate: parseFloat(item.sqftRate || 0),
            labourRate: parseFloat(item.labourRate || 0),
            fittingRate: parseFloat(item.fittingRate || 0),
            fabricRate: parseFloat(item.fabricRate || 0),
            channelRate: parseFloat(item.channelRate || 0),

            hasBlackout: Boolean(item.hasBlackout),
            blackout: parseFloat(item.blackout || 0),
            hasSheer: Boolean(item.hasSheer),
            sheer: parseFloat(item.sheer || 0),
            weightChain: parseFloat(item.weightChain || 0)
          }))
        }
      },
      create: {
        selectionId,
        items: {
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            category: item.category || 'Standard',
            type: item.type || 'Local',
            
            part: parseFloat(item.part || 0),
            panna: parseFloat(item.panna || 0),
            fabric: parseFloat(item.fabric || 0),
            channel: parseFloat(item.channel || 0),
            sqft: parseFloat(item.sqft || 0),

             // ✅ FIX: ADDED MISSING RATE FIELDS HERE TOO
            sqftRate: parseFloat(item.sqftRate || 0),
            labourRate: parseFloat(item.labourRate || 0),
            fittingRate: parseFloat(item.fittingRate || 0),
            fabricRate: parseFloat(item.fabricRate || 0),
            channelRate: parseFloat(item.channelRate || 0),
            
            hasBlackout: Boolean(item.hasBlackout),
            blackout: parseFloat(item.blackout || 0),
            hasSheer: Boolean(item.hasSheer),
            sheer: parseFloat(item.sheer || 0),
            weightChain: parseFloat(item.weightChain || 0)
          }))
        }
      }
    });

    res.json(calculation);
  } catch (error) {
    console.error('Calculation Save Error:', error);
    res.status(500).json({ error: 'Failed to save calculation' });
  }
});

// Add these routes to your index.ts file (after the local calculation routes)

// ==========================================
// DEEP CALCULATION ROUTES
// ==========================================

// Replace the GET /api/calculations/deep/:selectionId route in index.ts

app.get('/api/calculations/deep/:selectionId', authenticateToken, async (req: Request, res: Response) => {
  const { selectionId } = req.params;
  try {
    const deepCalc = await prisma.deepCalculation.findUnique({
      where: { selectionId },
      include: {
        items: {
          include: {
            selectionItem: {
              include: { product: true }
            }
          },
          orderBy: { selectionItem: { orderIndex: 'asc' } }
        }
      }
    });

    if (deepCalc && deepCalc.items.length > 0) {
      // 🔥 FIX: Show BOTH Local AND Roman items (both use fabric-based calculations)
      const filteredItems = deepCalc.items.filter((item: any) => {
        const calcType = item.selectionItem?.calculationType || '';
        return calcType.includes('Local') || calcType.includes('Roman');
      });

      console.log(`✅ Deep Calc Found: ${deepCalc.items.length} total, ${filteredItems.length} Local/Roman items`);

      return res.json({
        id: deepCalc.id,
        selectionId: deepCalc.selectionId,
        items: filteredItems
      });
    }

    // No deep calculation exists yet
    console.log('❌ No deep calculation found for selection:', selectionId);
    res.json(null);
  } catch (error) {
    console.error("Deep Calc Fetch Error:", error);
    res.status(500).json({ error: 'Failed to fetch deep calculation' });
  }
});
app.post('/api/calculations/deep/:selectionId', authenticateToken, async (req: Request, res: Response) => {
  const { selectionId } = req.params;
  const { items } = req.body;

  try {
    const deepCalc = await prisma.deepCalculation.upsert({
      where: { selectionId },
      update: {
        items: {
          deleteMany: {}, 
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            
            // ✅ CRITICAL FIX: Save the category so we can distinguish Local vs Roman
            category: item.category || 'Local', 

            width: parseFloat(item.width || 0),
            height: parseFloat(item.height || 0),
            unit: item.unit || 'mm',
            
            panna: parseFloat(item.panna || 0),
            part: parseFloat(item.part || 1), // Ensure part is saved
            channel: parseFloat(item.channel || 0),
            fabric: parseFloat(item.fabric || 0),
            blackout: parseFloat(item.blackout || 0),
            sheer: parseFloat(item.sheer || 0),
            labour: parseFloat(item.labour || 0),
            fitting: parseFloat(item.fitting || 0),
            weightChain: parseFloat(item.weightChain || 0),
            
            fabricRate: parseFloat(item.fabricRate || 0),
            blackoutRate: parseFloat(item.blackoutRate || 0),
            sheerRate: parseFloat(item.sheerRate || 0),
            channelRate: parseFloat(item.channelRate || 0),
            labourRate: parseFloat(item.labourRate || 0),
            fittingRate: parseFloat(item.fittingRate || 0),
            
            hasBlackout: Boolean(item.hasBlackout),
            hasSheer: Boolean(item.hasSheer)
          }))
        }
      },
      create: {
        selectionId,
        items: {
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            category: item.category || 'Local', // ✅ Save category here too
            
            width: parseFloat(item.width || 0),
            height: parseFloat(item.height || 0),
            unit: item.unit || 'mm',
            
            panna: parseFloat(item.panna || 0),
            part: parseFloat(item.part || 1),
            channel: parseFloat(item.channel || 0),
            fabric: parseFloat(item.fabric || 0),
            blackout: parseFloat(item.blackout || 0),
            sheer: parseFloat(item.sheer || 0),
            labour: parseFloat(item.labour || 0),
            fitting: parseFloat(item.fitting || 0),
            weightChain: parseFloat(item.weightChain || 0),
            
            fabricRate: parseFloat(item.fabricRate || 0),
            blackoutRate: parseFloat(item.blackoutRate || 0),
            sheerRate: parseFloat(item.sheerRate || 0),
            channelRate: parseFloat(item.channelRate || 0),
            labourRate: parseFloat(item.labourRate || 0),
            fittingRate: parseFloat(item.fittingRate || 0),
            
            hasBlackout: Boolean(item.hasBlackout),
            hasSheer: Boolean(item.hasSheer)
          }))
        }
      }
    });

    res.json(deepCalc);
  } catch (error) {
    console.error('❌ Deep Calc Save Error:', error);
    res.status(500).json({ error: 'Failed to save deep calculation' });
  }
});

app.get('/api/calculations/somfy/:selectionId', authenticateToken, async (req: Request, res: Response) => {
  const { selectionId } = req.params;
  try {
    // 1. Fetch the "Source of Truth": The Selection and all its items
    const selection = await prisma.selection.findUnique({
      where: { id: selectionId },
      include: { 
        items: { 
          include: { product: true },
          orderBy: { orderIndex: 'asc' }
        } 
      }
    });

    if (!selection) {
      res.status(404).json({ error: 'Selection not found' });
      return; 
    }

    // 2. Fetch the "Saved State": The Somfy Calculation record (if it exists)
    const somfyCalc = await prisma.somfyCalculation.findUnique({
      where: { selectionId },
      include: {
        items: true // We fetch these to see if we have saved prices/motors
      }
    });

    // 3. Filter Selection Items: Only get items assigned to "Somfy"
    const relevantSelectionItems = selection.items.filter(item => 
      item.calculationType && item.calculationType.includes('Somfy')
    );

    // 4. Merge: Combine fresh Selection items with saved Somfy data
    const mergedItems = relevantSelectionItems.map(item => {
      // specific saved record for this item
      const savedItem = somfyCalc?.items.find(si => si.selectionItemId === item.id);

      if (savedItem) {
        // CASE A: We have saved data. Return it, but attach the fresh selectionItem info
        return {
          ...savedItem,
          selectionItem: item // Critical: This ensures the frontend gets the name/width/etc
        };
      } else {
        // CASE B: It's a new assignment. Return a default structure.
        return {
          id: null, // Not saved in somfy table yet
          selectionItemId: item.id,
          selectionItem: item,
          trackType: 'Ripple',
          trackDuty: 'Medium',
          trackPrice: 0,
          motorName: '',
          motorPrice: 0,
          remoteName: '',
          remotePrice: 0,
          rippleTapePrice: 0,
          totalPrice: 0
        };
      }
    });

    // 5. Respond
    res.json({ 
      id: somfyCalc?.id || null,
      selectionId,
      items: mergedItems
    });

  } catch (error) {
    console.error("Somfy fetch error", error);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});
// [UPDATE IN index.ts]
app.post('/api/calculations/somfy/:selectionId', authenticateToken, async (req: Request, res: Response) => {
  const { selectionId } = req.params;
  const { items } = req.body;

  try {
    for (const item of items) {
      if (item.selectionItemId && item.width !== undefined) {
        await prisma.selectionItem.update({
          where: { id: item.selectionItemId },
          data: {
            width: parseFloat(item.width || 0),
            unit: item.unit || 'mm'
          }
        });
      }
    }

    const somfyCalc = await prisma.somfyCalculation.upsert({
      where: { selectionId },
      update: {
        items: {
          deleteMany: {},
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            trackType: item.trackType || 'Ripple',
            trackDuty: item.trackDuty || 'Medium',
            trackPrice: parseFloat(item.trackPrice || 0),
            motorName: item.motorName || '',
            motorPrice: parseFloat(item.motorPrice || 0),
            remoteName: item.remoteName || '',
            remotePrice: parseFloat(item.remotePrice || 0),
            rippleTapePrice: parseFloat(item.rippleTapePrice || 0),
            totalPrice: parseFloat(item.totalPrice || 0),
            
            // ✅ Save the new fields
            trackFinal: parseFloat(item.trackFinal || 0),
            motorFinal: parseFloat(item.motorFinal || 0),
            remoteFinal: parseFloat(item.remoteFinal || 0)
          }))
        }
      },
      create: {
        selectionId,
        items: {
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            trackType: item.trackType || 'Ripple',
            trackDuty: item.trackDuty || 'Medium',
            trackPrice: parseFloat(item.trackPrice || 0),
            motorName: item.motorName || '',
            motorPrice: parseFloat(item.motorPrice || 0),
            remoteName: item.remoteName || '',
            remotePrice: parseFloat(item.remotePrice || 0),
            rippleTapePrice: parseFloat(item.rippleTapePrice || 0),
            totalPrice: parseFloat(item.totalPrice || 0),

            // ✅ Save the new fields
            trackFinal: parseFloat(item.trackFinal || 0),
            motorFinal: parseFloat(item.motorFinal || 0),
            remoteFinal: parseFloat(item.remoteFinal || 0)
          }))
        }
      }
    });
    res.json(somfyCalc);
  } catch (error) {
    console.error('❌ Error saving somfy calculation:', error);
    res.status(500).json({ error: 'Failed to save somfy calculation' });
  }
});

app.get('/api/calculations/local/:selectionId', authenticateToken, async (req: Request, res: Response) => {
  const { selectionId } = req.params;
  try {
    const localCalc = await prisma.localCalculation.findUnique({
      where: { selectionId },
      include: {
        items: {
          include: {
            selectionItem: { 
              include: { product: true }
            }
          },
          orderBy: { selectionItem: { orderIndex: 'asc' } }
        }
      }
    });

    if (localCalc && localCalc.items.length > 0) {
      // 🔥 FIX: Use includes()
      const filteredItems = localCalc.items.filter(
        item => item.selectionItem.calculationType.includes('Local')
      );

      return res.json({
        id: localCalc.id,
        selectionId: localCalc.selectionId,
        isNew: false,
        items: filteredItems
      });
    }

    const selection = await prisma.selection.findUnique({
      where: { id: selectionId },
      include: { 
        items: { 
          include: { product: true },
          orderBy: { orderIndex: 'asc' }
        } 
      }
    });

    if (!selection) {
      return res.status(404).json({ error: 'Selection not found' });
    }

    // ✅ Filter for Local items
const localItems = selection.items.filter(item => item.calculationType.includes('Local'));
    return res.json({ 
      id: null,
      selectionId,
      isNew: true, 
      items: localItems.map(item => ({
        selectionItemId: item.id,
        selectionItem: item,
        panna: 0,
        channel: 0,
        fabric: 0,
        labour: 0,
        fitting: 0,
        fabricRate: 0,
        blackoutRate: 0,
        sheerRate: 0,
        channelRate: 285,
        labourRate: 450,
        fittingRate: 355,
        hasBlackout: false,
        blackout: 0,
        hasSheer: false,
        sheer: 0,
        weightChain: 0
      }))
    });
  } catch (error) {
    console.error("Local Calc Error:", error);
    res.status(500).json({ error: 'Failed to fetch local calculation' });
  }
});
// ==========================================
// FIX 2: SAVE LOCAL CALCULATION - Preserve measurements
// ==========================================
app.post('/api/calculations/local/:selectionId', authenticateToken, async (req: Request, res: Response) => {
  const { selectionId } = req.params;
  const { items } = req.body;

  try {
    // ✅ STEP 1: Update measurements back to SelectionItem (preserve them!)
    for (const item of items) {
      await prisma.selectionItem.update({
        where: { id: item.selectionItemId },
        data: {
          width: parseFloat(item.selectionItem?.width || item.width || 0),
          height: parseFloat(item.selectionItem?.height || item.height || 0),
          unit: item.selectionItem?.unit || item.unit || 'mm'
        }
      });
    }

    // ✅ STEP 2: Save calculation (deleteMany now safe because it only deletes LocalCalculationItems)
    const localCalc = await prisma.localCalculation.upsert({
      where: { selectionId },
      update: {
        items: {
          deleteMany: {}, // Safe - only deletes LocalCalculationItem records
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            panna: parseFloat(item.panna || 0),
            channel: parseFloat(item.channel || 0),
            fabric: parseFloat(item.fabric || 0),
            labour: parseFloat(item.labour || 0),
            fitting: parseFloat(item.fitting || 0),
            
            fabricRate: parseFloat(item.fabricRate || 0),
            blackoutRate: parseFloat(item.blackoutRate || 0),
            sheerRate: parseFloat(item.sheerRate || 0),
            channelRate: parseFloat(item.channelRate || 0),
            labourRate: parseFloat(item.labourRate || 0),
            fittingRate: parseFloat(item.fittingRate || 0),
            
            hasBlackout: Boolean(item.hasBlackout),
            blackout: parseFloat(item.blackout || 0),
            hasSheer: Boolean(item.hasSheer),
            sheer: parseFloat(item.sheer || 0),
            weightChain: parseFloat(item.weightChain || 0)
          }))
        }
      },
      create: {
        selectionId,
        items: {
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            panna: parseFloat(item.panna || 0),
            channel: parseFloat(item.channel || 0),
            fabric: parseFloat(item.fabric || 0),
            labour: parseFloat(item.labour || 0),
            fitting: parseFloat(item.fitting || 0),
            
            fabricRate: parseFloat(item.fabricRate || 0),
            blackoutRate: parseFloat(item.blackoutRate || 0),
            sheerRate: parseFloat(item.sheerRate || 0),
            channelRate: parseFloat(item.channelRate || 0),
            labourRate: parseFloat(item.labourRate || 0),
            fittingRate: parseFloat(item.fittingRate || 0),
            
            hasBlackout: Boolean(item.hasBlackout),
            blackout: parseFloat(item.blackout || 0),
            hasSheer: Boolean(item.hasSheer),
            sheer: parseFloat(item.sheer || 0),
            weightChain: parseFloat(item.weightChain || 0)
          }))
        }
      }
    });

    res.json(localCalc);
  } catch (error) {
    console.error('❌ Local Save Error:', error);
    res.status(500).json({ error: 'Failed to save local calculation' });
  }
});
app.get('/api/calculations/forest/:selectionId', authenticateToken, async (req: Request, res: Response) => {
  const { selectionId } = req.params;
  try {
    const forestCalc = await prisma.forestCalculation.findUnique({
      where: { selectionId },
      include: {
        items: {
          include: {
            selectionItem: {
              include: { product: true }
            }
          },
          orderBy: { selectionItem: { orderIndex: 'asc' } }
        }
      }
    });

if (forestCalc) {
      // 🔥 FIX: Use includes()
      const filteredItems = forestCalc.items.filter(
        item => item.selectionItem.calculationType.includes('Forest')
      );

      res.json({
        ...forestCalc,
        items: filteredItems
      });
      return;
    }

    const selection = await prisma.selection.findUnique({
      where: { id: selectionId },
      include: { 
        items: { 
          include: { product: true },
          orderBy: { orderIndex: 'asc' }
        } 
      }
    });

    if (!selection) {
      res.status(404).json({ error: 'Selection not found' });
      return;
    }

    // ✅ Filter for Forest items
const forestItems = selection.items.filter(item => item.calculationType.includes('Forest'));

    res.json({ 
      id: null,
      selectionId,
      items: forestItems.map(item => ({
        selectionItemId: item.id,
        selectionItem: item,
        trackType: 'white',
        trackPrice: 0,
        runnerType: 'FES BASE AND FLEX HOOK',
        runnerPrice: 0,
        tapeType: 'FLEX TAPE TRANSPARENT',
        tapePrice: 0,
        motorType: 'none',
        motorPrice: 0,
        remoteType: 'none',
        remotePrice: 0,
        motorGst: 0,
        totalBeforeGst: 0,
        gst: 0
      }))
    });
  } catch (error) {
    console.error("Forest fetch error", error);
    res.status(500).json({ error: 'Failed to fetch forest calculation' });
  }
});
// [UPDATE IN index.ts]
app.post('/api/calculations/forest/:selectionId', authenticateToken, async (req: Request, res: Response) => {
  const { selectionId } = req.params;
  const { items } = req.body;

  try {
    // Update widths first
    for (const item of items) {
      if (item.selectionItemId && item.width !== undefined) {
        await prisma.selectionItem.update({
          where: { id: item.selectionItemId },
          data: { width: parseFloat(item.width || 0) }
        });
      }
    }

    const forestCalc = await prisma.forestCalculation.upsert({
      where: { selectionId },
      update: {
        items: {
          deleteMany: {},
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            trackType: item.trackType || 'white',
            trackPrice: parseFloat(item.trackPrice || 0),
            runnerType: item.runnerType || 'FES BASE AND FLEX HOOK',
            runnerPrice: parseFloat(item.runnerPrice || 0),
            tapeType: item.tapeType || 'FLEX TAPE TRANSPARENT',
            tapePrice: parseFloat(item.tapePrice || 0),
            motorType: item.motorType || 'none',
            remoteType: item.remoteType || 'none',
            motorPrice: parseFloat(item.motorPrice || 0),
            motorGst: parseFloat(item.motorGst || 0),
            remotePrice: parseFloat(item.remotePrice || 0),
            totalBeforeGst: parseFloat(item.totalBeforeGst || 0),
            gst: parseFloat(item.gst || 0),
            
            // ✅ Save the new fields
            trackFinal: parseFloat(item.trackFinal || 0),
            motorFinal: parseFloat(item.motorFinal || 0),
            remoteFinal: parseFloat(item.remoteFinal || 0)
          }))
        }
      },
      create: {
        selectionId,
        items: {
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            trackType: item.trackType || 'white',
            trackPrice: parseFloat(item.trackPrice || 0),
            runnerType: item.runnerType || 'FES BASE AND FLEX HOOK',
            runnerPrice: parseFloat(item.runnerPrice || 0),
            tapeType: item.tapeType || 'FLEX TAPE TRANSPARENT',
            tapePrice: parseFloat(item.tapePrice || 0),
            motorType: item.motorType || 'none',
            remoteType: item.remoteType || 'none',
            motorPrice: parseFloat(item.motorPrice || 0),
            motorGst: parseFloat(item.motorGst || 0),
            remotePrice: parseFloat(item.remotePrice || 0),
            totalBeforeGst: parseFloat(item.totalBeforeGst || 0),
            gst: parseFloat(item.gst || 0),

            // ✅ Save the new fields
            trackFinal: parseFloat(item.trackFinal || 0),
            motorFinal: parseFloat(item.motorFinal || 0),
            remoteFinal: parseFloat(item.remoteFinal || 0)
          }))
        }
      }
    });
    res.json(forestCalc);
  } catch (error) {
    console.error('Error saving forest calculation:', error);
    res.status(500).json({ error: 'Failed to save forest calculation' });
  }
});

// [APPEND TO index.ts]

// ==========================================
// QUOTATION & AGGREGATION ROUTES
// ==========================================

// Helper: Merge all calculation sources into one final list
const getConsolidatedQuoteData = async (selectionId: string) => {
  // 1. Fetch Selection & Base Items
  const selection = await prisma.selection.findUnique({
    where: { id: selectionId },
    include: {
      inquiry: { include: { sales_person: true } },
      items: { orderBy: { orderIndex: 'asc' } }
    }
  });

  if (!selection) throw new Error("Selection not found");

  // 2. Fetch All Calculation Tables
  const [deepCalc, forestCalc, somfyCalc, genericCalc] = await Promise.all([
    prisma.deepCalculation.findUnique({ where: { selectionId }, include: { items: true } }),
    prisma.forestCalculation.findUnique({ where: { selectionId }, include: { items: true } }),
    prisma.somfyCalculation.findUnique({ where: { selectionId }, include: { items: true } }),
    prisma.calculation.findUnique({ where: { selectionId }, include: { items: true } }) // For Roman/Blinds
  ]);

  // 3. Merge Logic
  const quoteItems = selection.items.map((item, index) => {
    let materialCost = 0;
    let laborCost = 0;
    let hardwareCost = 0; // Tracks, Motors, Channels
    let taxAmount = 0;

    // --- A. Local / Deep Calculation (Fabric & Stitching) ---
    // Prefer DeepCalc, fallback to 0 (assuming Local Calc is migrated to Deep)
    const deepItem = deepCalc?.items.find(i => i.selectionItemId === item.id);
    if (deepItem) {
       const fabric = (deepItem.fabric || 0) * (deepItem.fabricRate || 0);
       const blackout = (deepItem.blackout || 0) * (deepItem.blackoutRate || 0);
       const sheer = (deepItem.sheer || 0) * (deepItem.sheerRate || 0);
       
       const labour = (deepItem.labour || 0) * (deepItem.labourRate || 0);
       const fitting = (deepItem.fitting || 0) * (deepItem.fittingRate || 0);
       const channel = (deepItem.channel || 0) * (deepItem.channelRate || 0);

       materialCost += fabric + blackout + sheer;
       laborCost += labour + fitting;
       hardwareCost += channel;
    }

    // --- B. Forest Calculation (Tracks & Motors) ---
    const forestItem = forestCalc?.items.find(i => i.selectionItemId === item.id);
    if (forestItem) {
      // Forest stores "Final" values which usually include GST. 
      // We need to reverse calculate or use base if available. 
      // Based on your schema, you store: trackFinal, motorFinal, remoteFinal
      hardwareCost += (forestItem.trackFinal || 0) + (forestItem.motorFinal || 0) + (forestItem.remoteFinal || 0);
    }

    // --- C. Somfy Calculation (Automation) ---
    const somfyItem = somfyCalc?.items.find(i => i.selectionItemId === item.id);
    if (somfyItem) {
       hardwareCost += (somfyItem.trackFinal || 0) + (somfyItem.motorFinal || 0) + (somfyItem.remoteFinal || 0);
    }

    // --- D. Roman / Blinds (Generic) ---
    const genericItem = genericCalc?.items.find(i => i.selectionItemId === item.id);
    if (genericItem) {
       if (genericItem.category === 'Blinds') {
          materialCost += (genericItem.sqft * genericItem.sqftRate);
          laborCost += (genericItem.sqft * genericItem.labourRate);
          hardwareCost += genericItem.fittingRate;
       } else if (genericItem.category === 'Roman') {
          materialCost += (genericItem.fabric * genericItem.fabricRate);
          laborCost += (genericItem.panna * genericItem.labourRate);
          hardwareCost += genericItem.fittingRate;
       }
    }

    // --- E. Summary ---
    // Note: This logic assumes the 'Final' values from modules (like Forest/Somfy) 
    // already include their specific taxes. For Local, we might need to add GST.
    // For simplicity in this preview, we sum them up. 
    
 if (materialCost + laborCost + hardwareCost === 0) {
       materialCost = (item.quantity * item.price);
    }

    const total = materialCost + laborCost + hardwareCost;
    
    // ✅ FIX: Cast details to 'any' to avoid TS error
    const areaName = (item.details as any)?.areaName || 'Area';

    return {
      sr: index + 1,
      desc: item.productName,
      area: areaName, // Use the fixed variable
      qty: item.quantity,
      unit: item.unit,
      
      material: materialCost,
      labor: laborCost,
      hardware: hardwareCost,
      
      total: total
    };
  });

  const subTotal = quoteItems.reduce((sum, i) => sum + i.total, 0);
  // Assuming 12% standard GST on the final aggregate if not already calculated inside modules
  // Since Forest/Somfy stored "Final" (with GST), and Local usually doesn't, 
  // you might need a more complex tax flag. For now, we will treat 'total' as Final.
  const grandTotal = subTotal; 

  return {
    selection,
    items: quoteItems,
    financials: {
      subTotal,
      tax: 0, // Set to 0 if modules provide inclusive prices
      grandTotal
    }
  };
};

// 1. GET PREVIEW DATA (Real-time aggregation)
app.get('/api/quotations/preview/:selectionId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const data = await getConsolidatedQuoteData(req.params.selectionId);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});


// 2. CREATE / FREEZE QUOTATION
app.post('/api/quotations', authenticateToken, async (req: any, res: Response) => {
  const { selectionId } = req.body;
  
  try {
    // 1. Generate Quote Number
    const date = new Date();
    const yearMonth = `${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    
    const counterRecord = await prisma.quotationCounter.upsert({
      where: { year_month: yearMonth },
      update: { counter: { increment: 1 } },
      create: { year_month: yearMonth, counter: 1 },
    });
    
    const quoteNumber = `QT-${yearMonth}${counterRecord.counter.toString().padStart(4, '0')}`;

    // 2. Get Data
    const data = await getConsolidatedQuoteData(selectionId);

    // 3. Save
    const quotation = await prisma.quotation.create({
  data: {
    quotation_number: quoteNumber,
    selectionId,
    clientName: data.selection.inquiry?.client_name || 'Valued Client',
    clientAddress: data.selection.inquiry?.address || '',
    subTotal: data.financials.subTotal,
    discountTotal: 0,  // Add this
    taxableValue: data.financials.subTotal,  // Add this
    gstTotal: data.financials.tax,  // ✅ Changed from taxAmount
    transportationCharge: 0,  // Add this
    installationCharge: 0,  // Add this
    grandTotal: data.financials.grandTotal,
    created_by_id: req.user.id
  }
});

    res.json(quotation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create quotation' });
  }
});
// ==========================================
// QUOTATION ROUTES - CLEANED UP
// ==========================================

// 1. LIST ALL QUOTATIONS
app.get('/api/quotations', authenticateToken, async (req: Request, res: Response) => {
  try {
    const quotes = await prisma.quotation.findMany({
      include: {
        selection: { include: { inquiry: true } },
        created_by: { select: { name: true } }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(quotes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quotations' });
  }
});
// 2. GENERATE NEW QUOTATION (UPDATED LOGIC)
app.post('/api/quotations/generate', authenticateToken, async (req: any, res: Response) => {
  const { selectionId, quotationType } = req.body; 
  
  try {
    const rawData = await getConsolidatedQuoteData(selectionId); 
    const selection = rawData.selection;

    // Generate Quote Number
    const date = new Date();
    const yearMonth = `${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    const counterRecord = await prisma.quotationCounter.upsert({
      where: { year_month: yearMonth },
      update: { counter: { increment: 1 } },
      create: { year_month: yearMonth, counter: 1 },
    });
    const quoteNumber = `SB${yearMonth}${counterRecord.counter.toString().padStart(3, '0')}`;

    let quoteItems;

    if (quotationType === 'simple') {
      // ✅ SIMPLE LOGIC: Group items by AREA
      // We use a Map or Object to aggregate totals per area
      const groupedItems: Record<string, any> = {};

      rawData.items.forEach((item: any) => {
        // Use Area name as key, or 'General' if missing
        const areaKey = item.area || 'General';

        if (!groupedItems[areaKey]) {
          groupedItems[areaKey] = {
            areaName: areaKey,
            totalCost: 0,
            itemCount: 0,
            unit: 'Lot' // Simple quotes usually use "Lot" or "Set"
          };
        }

        // Add to the group total
        groupedItems[areaKey].totalCost += item.total;
        groupedItems[areaKey].itemCount += 1;
      });

      // Convert the grouped object back to an array for the DB
      quoteItems = Object.values(groupedItems).map((group: any, index: number) => ({
        srNo: index + 1,
        // Description says "Furnishing work for [Area]"
        description: `Window Furnishing & Decor for ${group.areaName}`,
        quantity: 1, // We treat the whole area as 1 unit
        unit: 'Lot',
        unitPrice: Math.ceil(group.totalCost), // The total price becomes the unit price
        discountPercent: 0,
        gstPercent: 12, // Default GST for aggregated items
      }));

    } else {
      // ✅ DETAILED LOGIC: Keep 1-to-1 mapping (As you had before)
      quoteItems = rawData.items.map((item: any, index: number) => {
        const unitPrice = item.qty > 0 ? (item.total / item.qty) : 0;

        return {
          srNo: index + 1,
          description: `${item.desc} (${item.area})`, // Description + Area
          quantity: item.qty,
          unit: item.unit,
          unitPrice: Math.ceil(unitPrice),
          discountPercent: 0,
          gstPercent: 12,
        };
      });
    }

    // Create the Quotation in DB
    const newQuote = await prisma.quotation.create({
      data: {
        quotation_number: quoteNumber,
        quotationType: quotationType || 'detailed',
        selectionId,
        clientName: selection.inquiry?.client_name || 'Valued Client',
        clientAddress: selection.inquiry?.address || '',
        subTotal: 0,
        discountTotal: 0,
        taxableValue: 0,
        gstTotal: 0,
        transportationCharge: 0,
        installationCharge: 0,
        grandTotal: 0,
        created_by_id: req.user.id,
        items: {
          create: quoteItems.map(item => {
            const calcs = calculateRow(item);
            return {
              ...item,
              subtotal: item.quantity * item.unitPrice,
              taxableValue: (item.quantity * item.unitPrice) - calcs.discountAmount,
              discountAmount: calcs.discountAmount,
              gstAmount: calcs.gstAmount,
              total: calcs.total
            };
          })
        }
      },
      include: { items: true }
    });

    // Recalculate Totals (Same as before)
    const subTotal = newQuote.items.reduce((acc, i) => acc + (i.quantity * i.unitPrice), 0);
    const discountTotal = newQuote.items.reduce((acc, i) => acc + i.discountAmount, 0);
    const taxableValue = subTotal - discountTotal;
    const gstTotal = newQuote.items.reduce((acc, i) => acc + i.gstAmount, 0);
    const grandTotal = taxableValue + gstTotal;

    const updatedQuote = await prisma.quotation.update({
      where: { id: newQuote.id },
      data: { subTotal, discountTotal, taxableValue, gstTotal, grandTotal },
      include: { 
        items: { orderBy: { srNo: 'asc' } },
        selection: { include: { inquiry: { include: { sales_person: true } } } }
      }
    });

    res.json(updatedQuote);

  } catch (error) {
    console.error('❌ Generate quotation error:', error);
    res.status(500).json({ error: 'Failed to generate quotation' });
  }
});
// 3. GET SINGLE QUOTATION BY ID (Must be AFTER /generate)
app.get('/api/quotations/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const quote = await prisma.quotation.findUnique({
      where: { id: req.params.id },
      include: { 
        items: { orderBy: { srNo: 'asc' } },
        selection: { 
          include: { 
            inquiry: { 
              include: { 
                sales_person: { select: { name: true } } 
              } 
            } 
          } 
        }
      }
    });

    if (!quote) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    res.json(quote);
  } catch (error) {
    console.error('❌ Error fetching quotation:', error);
    res.status(500).json({ error: 'Failed to fetch quotation' });
  }
});

// 4. UPDATE QUOTATION
app.put('/api/quotations/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { clientName, clientAddress, transportationCharge, installationCharge, items } = req.body;

  try {
    const processedItems = items.map((item: any) => {
      const calcs = calculateRow(item);
      return { ...item, ...calcs };
    });

    const subTotal = processedItems.reduce((sum: number, i: any) => sum + (i.quantity * i.unitPrice), 0);
    const discountTotal = processedItems.reduce((sum: number, i: any) => sum + i.discountAmount, 0);
    const gstTotal = processedItems.reduce((sum: number, i: any) => sum + i.gstAmount, 0);
    const itemsTotal = processedItems.reduce((sum: number, i: any) => sum + i.total, 0);
    
    const trans = parseFloat(transportationCharge) || 0;
    const install = parseFloat(installationCharge) || 0;
    const grandTotal = itemsTotal + trans + install;

    await prisma.$transaction([
      prisma.quotationItem.deleteMany({ where: { quotationId: id } }),
      prisma.quotation.update({
        where: { id },
        data: {
          clientName,
          clientAddress,
          transportationCharge: trans,
          installationCharge: install,
          subTotal,
          discountTotal,
          gstTotal,
          grandTotal,
          items: {
            create: processedItems.map((i: any) => ({
              srNo: i.srNo,
              description: i.description,
              quantity: parseFloat(i.quantity),
              unit: i.unit,
              unitPrice: parseFloat(i.unitPrice),
              discountPercent: parseFloat(i.discountPercent),
              discountAmount: i.discountAmount,
              gstPercent: parseFloat(i.gstPercent),
              gstAmount: i.gstAmount,
              total: i.total
            }))
          }
        }
      })
    ]);

    const updated = await prisma.quotation.findUnique({
      where: { id },
      include: { items: { orderBy: { srNo: 'asc' } } }
    });
    
    res.json(updated);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update quotation' });
  }
});

// 5. DELETE QUOTATION
app.delete('/api/quotations/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    // Prisma cascade delete will automatically remove QuotationItems if configured in schema.
    // If not, we explicitly delete items first:
    await prisma.quotationItem.deleteMany({ where: { quotationId: id } });
    
    await prisma.quotation.delete({ 
      where: { id } 
    });

    res.json({ message: 'Quotation deleted successfully' });
  } catch (error) {
    console.error('❌ Delete Quotation Error:', error);
    res.status(500).json({ error: 'Failed to delete quotation' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));