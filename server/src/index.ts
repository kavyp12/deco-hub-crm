
import express, { Request, Response } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import * as xlsx from 'xlsx';
import { authenticateToken, requireRole } from './middleware/authMiddleware';
import path from 'path';
import { format } from 'date-fns';
import fs from 'fs';

dotenv.config();
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

const upload = multer({ storage: multer.memoryStorage() });


// Use UPLOAD_DIR from .env if it exists (Server), otherwise fallback to local relative path
const documentsDir = process.env.UPLOAD_DIR || path.join(__dirname, '../documents');

if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}

app.use('/documents', express.static(documentsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, documentsDir); // Save to D:\deco-hub-crm\server\documents
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const uploadDocs = multer({ storage: storage });

app.use(cors({
  origin: true, // Allow connections
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

const logActivity = async (userId: string, action: string, entity: string, entityId: string | null, details: any) => {
  try {
    const detailsString = typeof details === 'object' ? JSON.stringify(details) : String(details);

    await prisma.activityLog.create({
      data: {
        userId: userId,
        action: action.toUpperCase(),
        entity: entity.toUpperCase(),
        entityId: entityId ? String(entityId) : null,
        details: detailsString
      }
    });
  } catch (err) {
    console.error("LOGGING ERROR:", err);
  }
};


app.post('/api/companies', authenticateToken, async (req: any, res) => {
  try {
    const { name } = req.body;

    // 1. Create Item
    const newCompany = await prisma.company.create({
      data: { name }
    });

    // 2. LOG THE ACTIVITY
    await logActivity(
      req.user.id,
      'CREATE',
      'COMPANY',
      newCompany.id,
      `Created new company: ${name}`
    );

    res.json(newCompany);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create' });
  }
});

// ==========================================
// LOGGING HELPER FUNCTION
// ==========================================


// ── Helper Function to Enrich Logs with Client context ──
async function enrichLogsWithContext(logs: any[]) {
  const INQUIRY_ENTITIES = new Set(['INQUIRY', 'INQUIRY_STAGE', 'INQUIRY_MEMBERS', 'INQUIRY_OWNER']);
  const QUOTATION_ENTITIES = new Set(['QUOTATION']);

  const inquiryIds = [...new Set(logs.filter(l => INQUIRY_ENTITIES.has(l.entity) && l.entityId).map(l => l.entityId as string))];
  const quotationIds = [...new Set(logs.filter(l => QUOTATION_ENTITIES.has(l.entity) && l.entityId).map(l => l.entityId as string))];

  const infoMap = new Map<string, { clientName: string; refNumber: string }>();

  if (inquiryIds.length > 0) {
    const inqs = await prisma.inquiry.findMany({
      where: { id: { in: inquiryIds } },
      select: { id: true, client_name: true, inquiry_number: true },
    });
    inqs.forEach(i => infoMap.set(i.id, { clientName: i.client_name, refNumber: i.inquiry_number }));
  }

  if (quotationIds.length > 0) {
    const quotes = await prisma.quotation.findMany({
      where: { id: { in: quotationIds } },
      select: { id: true, clientName: true, quotation_number: true },
    });
    quotes.forEach(q => infoMap.set(q.id, { clientName: q.clientName, refNumber: q.quotation_number }));
  }

  // Pre-fetch users for mapping
  const userIds = [...new Set(logs.map(l => l.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true }
  });
  const userMap = new Map(users.map(u => [u.id, u.name]));

  return logs.map(log => {
    let clientName = null;
    let inquiryNumber = null;

    if (INQUIRY_ENTITIES.has(log.entity) && log.entityId) {
      const info = infoMap.get(log.entityId);
      if (info) { clientName = info.clientName; inquiryNumber = info.refNumber; }
    } else if (QUOTATION_ENTITIES.has(log.entity) && log.entityId) {
      const info = infoMap.get(log.entityId);
      if (info) { clientName = info.clientName; inquiryNumber = info.refNumber; }
    }

    return {
      ...log,
      userName: userMap.get(log.userId) || 'Unknown User',
      clientName,
      inquiryNumber
    };
  });
}

// GET LOGS (Missing Route)
app.get('/api/logs', authenticateToken, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access Denied' });
    }

    // Fetch logs
    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500 // Increased limit for better visibility
    });

    const enrichedLogs = await enrichLogsWithContext(logs);

    res.json(enrichedLogs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// GET /api/logs/employee/:userId — Full day-by-day activity timeline for one employee
app.get('/api/logs/employee/:userId', authenticateToken, async (req: any, res: Response): Promise<void> => {
  try {
    if (req.user.role !== 'super_admin') {
      res.status(403).json({ error: 'Access Denied' });
      return;
    }

    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const where: any = { userId };
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999)),
      };
    }

    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const enrichedLogs = await enrichLogsWithContext(logs);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, email: true },
    });

    // Group logs by date for day-by-day structure
    const groupedByDate: Record<string, any[]> = {};
    for (const log of enrichedLogs) {
      const day = new Date(log.createdAt).toISOString().split('T')[0];
      if (!groupedByDate[day]) groupedByDate[day] = [];
      groupedByDate[day].push(log);
    }

    const timeline = Object.entries(groupedByDate)
      .sort(([a], [b]) => b.localeCompare(a)) // latest first
      .map(([date, entries]) => ({
        date,
        totalActions: entries.length,
        creates: entries.filter((e: any) => e.action === 'CREATE').length,
        updates: entries.filter((e: any) => e.action === 'UPDATE').length,
        deletes: entries.filter((e: any) => e.action === 'DELETE').length,
        logins: entries.filter((e: any) => e.action === 'LOGIN').length,
        entries,
      }));

    res.json({ user, timeline });
  } catch (error) {
    console.error('Employee log error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// GET /api/logs/employees-summary — Activity summary for ALL employees (for report section)
app.get('/api/logs/employees-summary', authenticateToken, async (req: any, res: Response): Promise<void> => {
  try {
    if (req.user.role !== 'super_admin') {
      res.status(403).json({ error: 'Access Denied' });
      return;
    }

    const { startDate, endDate } = req.query;

    const where: any = {};
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999)),
      };
    }

    const [logs, users] = await Promise.all([
      prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' } }),
      prisma.user.findMany({ select: { id: true, name: true, role: true, email: true } }),
    ]);

    const userMap = new Map(users.map(u => [u.id, u]));

    // Group by userId
    const byUser: Record<string, any> = {};
    for (const log of logs) {
      if (!byUser[log.userId]) {
        const u = userMap.get(log.userId);
        byUser[log.userId] = {
          userId: log.userId,
          userName: u?.name || 'Unknown',
          userRole: u?.role || 'Unknown',
          totalActions: 0,
          creates: 0,
          updates: 0,
          deletes: 0,
          logins: 0,
          lastActive: null,
          activeDays: new Set<string>(),
        };
      }
      const entry = byUser[log.userId];
      entry.totalActions++;
      if (log.action === 'CREATE') entry.creates++;
      if (log.action === 'UPDATE') entry.updates++;
      if (log.action === 'DELETE') entry.deletes++;
      if (log.action === 'LOGIN') entry.logins++;
      if (!entry.lastActive || new Date(log.createdAt) > new Date(entry.lastActive)) {
        entry.lastActive = log.createdAt;
      }
      entry.activeDays.add(new Date(log.createdAt).toISOString().split('T')[0]);
    }

    const summary = Object.values(byUser).map((e: any) => ({
      ...e,
      activeDays: e.activeDays.size, // convert Set to count
    })).sort((a: any, b: any) => b.totalActions - a.totalActions);

    res.json(summary);
  } catch (error) {
    console.error('Employee summary error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// 2. EXCEL EXPORT ENDPOINT (NEW)
app.get('/api/logs/export', authenticateToken, async (req: any, res: Response): Promise<void> => {
  try {
    if (req.user.role !== 'super_admin') {
      res.status(403).json({ error: 'Access Denied' });
      return;
    }

    // 1. Fetch ALL logs (No limit for export)
    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' }
    });

    // 2. Fetch Users for Name Mapping
    const users = await prisma.user.findMany({ select: { id: true, name: true, role: true } });
    const userMap = new Map(users.map(u => [u.id, u]));

    // 3. Format Data for Excel
    const excelData = logs.map(log => {
      const user = userMap.get(log.userId);
      return {
        "Date": new Date(log.createdAt).toLocaleDateString(),
        "Time": new Date(log.createdAt).toLocaleTimeString(),
        "Action": log.action,
        "Entity": log.entity,
        "Description": log.details,
        "User Name": user ? user.name : 'Unknown',
        "User Role": user ? user.role : 'Unknown',
        "Related ID": log.entityId || 'N/A'
      };
    });

    // 4. Create Workbook
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(excelData);

    // Auto-width for columns (Optional helper)
    const wscols = [
      { wch: 12 }, // Date
      { wch: 12 }, // Time
      { wch: 10 }, // Action
      { wch: 15 }, // Entity
      { wch: 50 }, // Description
      { wch: 20 }, // User Name
      { wch: 15 }, // Role
      { wch: 30 }, // ID
    ];
    ws['!cols'] = wscols;

    xlsx.utils.book_append_sheet(wb, ws, "Activity Logs");

    // 5. Send Buffer
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="ActivityLogs.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    console.error("Export Error:", error);
    res.status(500).json({ error: "Failed to generate export" });
  }
});

// ==========================================
// 1. AUTH ROUTES
// ==========================================

app.post('/api/auth/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  console.log('🔵 Login attempt:', { email }); // Add logging

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    console.log('🔵 User found:', !!user); // Add logging

    if (!user) {
      res.status(400).json({ error: 'User not found' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    console.log('🔵 Password valid:', validPassword); // Add logging

    if (!validPassword) {
      res.status(400).json({ error: 'Invalid password' });
      return;
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    const { password: _, ...userInfo } = user;

    console.log('✅ Login successful'); // Add logging
    await logActivity(user.id, 'LOGIN', 'AUTH', null, `${user.name} logged in`);
    res.json({ token, user: userInfo });
  } catch (error) {
    console.error('❌ Login error:', error); // Add logging
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

// CREATE EMPLOYEE
app.post('/api/employees', authenticateToken, requireRole(['super_admin']), async (req: any, res: Response) => {
  const { name, email, password, mobile_number, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: { name, email, password: hashedPassword, mobile_number, role },
    });

    // [LOG]
    await logActivity(req.user.id, 'CREATE', 'EMPLOYEE', newUser.id, `Created employee: ${name} (${role})`);

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


// UPDATE EMPLOYEE
// UPDATE EMPLOYEE
app.put('/api/employees/:id', authenticateToken, requireRole(['super_admin']), async (req: any, res: Response) => {
  const { id } = req.params;
  const { name, email, mobile_number, role, password } = req.body; // <-- Added email here
  try {
    const updateData: any = { name, email, mobile_number, role }; // <-- Added email here

    // If a new password was provided in the request, hash it and add it to the update
    if (password && password.trim() !== '') {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    // [LOG] Log if password was changed
    await logActivity(
      req.user.id, 
      'UPDATE', 
      'EMPLOYEE', 
      id, 
      `Updated employee: ${name} ${password ? '(Password reset)' : ''}`
    );

    res.json(updated);
  } catch (error: any) {
    // Handle Prisma unique constraint error if the new email is already taken
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'This email is already in use by another employee' });
    }
    res.status(500).json({ error: 'Failed to update employee' });
  }
});
// DELETE EMPLOYEE
app.delete('/api/employees/:id', authenticateToken, requireRole(['super_admin']), async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    // Fetch first to get name for log
    const userToDelete = await prisma.user.findUnique({ where: { id } });
    await prisma.user.delete({ where: { id } });

    // [LOG]
    await logActivity(req.user.id, 'DELETE', 'EMPLOYEE', id, `Deleted employee: ${userToDelete?.name}`);

    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

app.get('/api/users/sales-people', authenticateToken, async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ['sales', 'sales_manager', 'super_admin'] } },
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

app.post('/api/companies', authenticateToken, requireRole(['super_admin', 'admin_hr']), async (req: any, res: Response) => {
  try {
    const company = await prisma.company.create({ data: { name: req.body.name } });

    // [LOG]
    await logActivity(req.user.id, 'CREATE', 'COMPANY', company.id, `Created Company: ${company.name}`);

    res.json(company);
  } catch (error) {
    res.status(400).json({ error: 'Company likely already exists' });
  }
});

app.delete('/api/companies/:id', authenticateToken, requireRole(['super_admin']), async (req: any, res: Response) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    await prisma.company.delete({ where: { id: req.params.id } });

    // [LOG]
    await logActivity(req.user.id, 'DELETE', 'COMPANY', req.params.id, `Deleted Company: ${company?.name || req.params.id}`);

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
      cellFormula: false,
      raw: false
    });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data: any[] = xlsx.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: '',
      blankrows: false,
      range: 1
    });

    if (data.length === 0) {
      res.status(400).json({ error: 'Excel sheet is empty or has no data rows' });
      return;
    }

    const cleanData = data.filter(row => {
      const srNo = row['Sr. No'] ?? row['Sr No'];
      return srNo !== undefined && srNo !== '' && !isNaN(parseFloat(String(srNo)));
    });

    let productsCreated = 0;
    const errors: string[] = [];

    const SKIP_COLUMNS = new Set([
      'Sr. No', 'Sr No', 'Collection', 'Design/ Quality',
      'SRL No',                           // ✅ ADDED: handled manually below
      'RRP', 'CL Landing Cost', 'RL Landing Cost',
      'GST Amount', 'MRP'
    ]);

    for (let i = 0; i < cleanData.length; i++) {
      const row = cleanData[i];
      const rowNumber = i + 3;

      const srNo = (row['Sr. No'] ?? row['Sr No'])?.toString().trim();  // Row serial: 1, 2, 3...
      const srlNo = row['SRL No']?.toString().trim();                     // ✅ Real SRL: "1, 17, 25, 40"
      const collection = row['Collection']?.toString().trim();
      const design = row['Design/ Quality']?.toString().trim();
      const rrpRaw = row['RRP']?.toString().trim();

      if (!collection) { errors.push(`Row ${rowNumber}: Missing Collection`); continue; }
      if (!design) { errors.push(`Row ${rowNumber}: Missing Design/ Quality`); continue; }
      if (!rrpRaw) { errors.push(`Row ${rowNumber}: Missing RRP`); continue; }

      const priceString = rrpRaw
        .replace(/₹/g, '')
        .replace(/,/g, '')
        .replace(/\s+/g, '')
        .trim();

      if (!priceString || isNaN(parseFloat(priceString))) {
        errors.push(`Row ${rowNumber}: Invalid RRP price "${rrpRaw}"`);
        continue;
      }

      let catalog = await prisma.catalog.findFirst({ where: { name: collection, companyId } });
      if (!catalog) {
        catalog = await prisma.catalog.create({
          data: { name: collection, companyId, type: defaultType || 'Curtains' }
        });
      }

      const attributes: any = {};
      for (const col in row) {
        if (SKIP_COLUMNS.has(col.trim())) continue;
        const val = row[col];
        if (val !== undefined && val !== null && val !== '') {
          attributes[col.trim()] = String(val).trim();
        }
      }

      // ✅ Store row serial for the Catalog table display (Sr. No column)
      if (srNo) attributes['Sr. No'] = srNo;

      // ✅ Store the REAL SRL numbers ("1, 17, 25, 40") under 'srlNo' for dropdown splitting
      if (srlNo) attributes['srlNo'] = srlNo;

      // ✅ Also keep original key for Catalogs.tsx display which reads 'SRL No'
      if (srlNo) attributes['SRL No'] = srlNo;

      try {
        await prisma.product.create({
          data: {
            name: design,
            price: priceString,
            catalogId: catalog.id,
            attributes
          }
        });
        productsCreated++;
      } catch (err) {
        errors.push(`Row ${rowNumber}: Failed to save "${design}"`);
      }
    }

    const response: any = {
      success: true,
      message: `Successfully processed ${productsCreated} products`,
      productsCreated,
      totalRows: cleanData.length
    };
    if (errors.length > 0) {
      response.errors = errors;
      response.message += ` (${errors.length} errors)`;
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    await logActivity(req.user.id, 'UPLOAD', 'CATALOG', null, `Uploaded catalog for company: ${company?.name || companyId}. Processed ${productsCreated} products.`);
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
            type: true,
            companyId: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // ✅ FIX 2: Lift srlNo out of attributes to a top-level field
    // This is what utils.ts reads as product.srlNo
    const mapped = products.map(p => ({
      ...p,
      srlNo: (p.attributes as any)?.srlNo
        || (p.attributes as any)?.['Sr. No']
        || ''
    }));

    res.json(mapped);
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
            id: true,
            name: true,
            type: true,
            companyId: true,
            company: {
              select: {
                id: true,
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

    // ✅ FIX 3: Same srlNo lift as the catalog products route
    const mapped = products.map(p => ({
      ...p,
      srlNo: (p.attributes as any)?.srlNo
        || (p.attributes as any)?.['Sr. No']
        || ''
    }));

    res.json(mapped);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});
app.put('/api/products/:id', authenticateToken, requireRole(['super_admin', 'admin_hr']), async (req: any, res: Response) => {
  const { price, imageUrl, name } = req.body;
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { price, imageUrl, name }
    });
    await logActivity(req.user.id, 'UPDATE', 'PRODUCT', req.params.id, `Updated product: ${product.name}`);
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});
// ==========================================
// ATTENDANCE & REPORTING ROUTES
// ==========================================

// 1. GET MY ATTENDANCE (Dashboard & Timer State)
app.get('/api/attendance/me', authenticateToken, async (req: any, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecord = await prisma.attendance.findFirst({
      where: { userId: req.user.id, date: { gte: today } }
    });

    const history = await prisma.attendance.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 30
    });

    res.json({ today: todayRecord, history });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// GET TEAM ATTENDANCE (Admin Only)
app.get('/api/attendance/team', authenticateToken, requireRole(['super_admin', 'admin_hr']), async (req: any, res: Response) => {
  try {
    const { date, status } = req.query;
    let whereClause: any = {};

    // 1. Filter by Date
    if (date) {
      const filterDate = new Date(date as string);
      const startOfDay = new Date(filterDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(filterDate.setHours(23, 59, 59, 999));

      whereClause.date = {
        gte: startOfDay,
        lte: endOfDay
      };
    }

    // 2. Filter by Status
    if (status && status !== 'ALL') {
      whereClause.status = status;
    }

    // 3. Fetch Team Data
    const teamAttendance = await prisma.attendance.findMany({
      where: whereClause,
      include: {
        user: { select: { name: true, role: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(teamAttendance);
  } catch (error) {
    console.error('Team Attendance Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch team attendance' });
  }
});
app.get('/api/attendance/export', authenticateToken, requireRole(['super_admin', 'admin_hr']), async (req: any, res: Response): Promise<void> => {
  try {
    const records = await prisma.attendance.findMany({
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' }
    });

    // Helper function to format exact time for Excel
    const formatExcelTime = (decimalHours: number | null | undefined) => {
      if (!decimalHours) return '00:00:00';
      const totalSecs = Math.floor(decimalHours * 3600);
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const excelData = records.map(rec => ({
      "Date": new Date(rec.createdAt).toLocaleDateString(),
      "Employee": rec.user?.name || 'Unknown',
      "Role": rec.user?.role || 'N/A',
      "Check In": new Date(rec.checkIn).toLocaleTimeString(),
      "Check Out": rec.checkOut ? new Date(rec.checkOut).toLocaleTimeString() : 'Active',

      // Updated to use the HH:MM:SS formatter
      "Breaks (HH:MM:SS)": formatExcelTime(rec.totalBreakHours),

      "Net Hours": rec.workingHours ? rec.workingHours.toFixed(2) : '0',
      "Status": rec.status,
      "Late": rec.isLate ? 'Yes' : 'No',
      "Tasks": rec.reportTasks || '',
      "WIP": rec.reportWip || '',
      "Issues": rec.reportIssues || '',
      "Plan for Tomorrow": rec.reportPending || ''
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(excelData);
    xlsx.utils.book_append_sheet(wb, ws, "Attendance Report");

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Attendance_Report.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// 2. CHECK IN (Handles Late Marks & Location)
app.post('/api/attendance/check-in', authenticateToken, async (req: any, res: Response) => {
  const { latitude, longitude, locationName } = req.body;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.attendance.findFirst({
      where: { userId: req.user.id, date: { gte: today } }
    });

    if (existing) return res.status(400).json({ error: 'Already checked in for today' });

    // Late Mark Logic (e.g., strictly after 9:45 AM)
    const now = new Date();
    const isLate = now.getHours() >= 9 && now.getMinutes() > 45;

    const newRecord = await prisma.attendance.create({
      data: {
        userId: req.user.id,
        checkIn: now,
        isLate,
        latitude,
        longitude,
        locationName,
        status: 'ACTIVE'
      }
    });

    await logActivity(req.user.id, 'CREATE', 'ATTENDANCE', newRecord.id, 'Checked In');
    res.json(newRecord);
  } catch (error) {
    res.status(500).json({ error: 'Check-in failed' });
  }
});

// 3. PAUSE SHIFT (Break Start)
app.post('/api/attendance/pause', authenticateToken, async (req: any, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await prisma.attendance.findFirst({
      where: { userId: req.user.id, date: { gte: today }, status: 'ACTIVE' }
    });

    if (!record) return res.status(400).json({ error: 'No active session found.' });

    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: { status: 'PAUSED', lastPauseTime: new Date() }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to pause shift' });
  }
});

// 4. RESUME SHIFT (Break End & Calculation)
app.post('/api/attendance/resume', authenticateToken, async (req: any, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await prisma.attendance.findFirst({
      where: { userId: req.user.id, date: { gte: today }, status: 'PAUSED' }
    });

    if (!record || !record.lastPauseTime) return res.status(400).json({ error: 'No paused session found.' });

    // Calculate break duration
    const breakDurationMs = new Date().getTime() - new Date(record.lastPauseTime).getTime();
    const breakDurationHours = breakDurationMs / (1000 * 60 * 60);

    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: {
        status: 'ACTIVE',
        lastPauseTime: null,
        totalBreakHours: { increment: breakDurationHours }
      }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to resume shift' });
  }
});

// 5. SAVE DRAFT REPORT (Auto-save)
app.put('/api/attendance/draft', authenticateToken, async (req: any, res: Response) => {
  const { tasks, wip, issues, pending } = req.body;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await prisma.attendance.findFirst({
      where: { userId: req.user.id, date: { gte: today }, status: { in: ['ACTIVE', 'PAUSED'] } }
    });

    if (!record) return res.status(404).json({ error: 'No active session found.' });

    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: { draftTasks: tasks, draftWip: wip, draftIssues: issues, draftPending: pending }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// 6. CHECK OUT & SUBMIT REPORT (Calculates Final Net Hours)
app.put('/api/attendance/check-out', authenticateToken, async (req: any, res: Response) => {
  const { tasks, wip, issues, pending } = req.body;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await prisma.attendance.findFirst({
      where: { userId: req.user.id, date: { gte: today }, status: { in: ['ACTIVE', 'PAUSED'] } }
    });

    if (!record) return res.status(404).json({ error: 'No active session found.' });

    // Calculate Total Hours minus breaks
    const checkOutTime = new Date();
    const checkInTime = new Date(record.checkIn);

    // If checking out while paused, add the final paused segment to total break time
    let finalBreakHours = record.totalBreakHours;
    if (record.status === 'PAUSED' && record.lastPauseTime) {
      const finalBreakMs = checkOutTime.getTime() - new Date(record.lastPauseTime).getTime();
      finalBreakHours += (finalBreakMs / (1000 * 60 * 60));
    }

    const diffInMs = checkOutTime.getTime() - checkInTime.getTime();
    const grossHours = diffInMs / (1000 * 60 * 60);
    const netWorkingHours = Math.max(0, grossHours - finalBreakHours);

    // Overtime calculation (Assuming 8 hours is standard)
    const overtimeHours = netWorkingHours > 8 ? netWorkingHours - 8 : 0;

    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: {
        checkOut: checkOutTime,
        status: 'COMPLETED',
        workingHours: netWorkingHours,
        totalBreakHours: finalBreakHours,
        overtimeHours,
        reportTasks: tasks,
        reportWip: wip,
        reportIssues: issues,
        reportPending: pending
      }
    });

    await logActivity(req.user.id, 'UPDATE', 'ATTENDANCE', record.id, 'Checked Out with Report');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Check-out failed' });
  }
});

// 7. TIME CORRECTION REQUEST
app.post('/api/attendance/correction', authenticateToken, async (req: any, res: Response) => {
  const { date, requestedCheckIn, requestedCheckOut, reason } = req.body;
  try {
    const correction = await prisma.timeCorrection.create({
      data: {
        userId: req.user.id,
        date: new Date(date),
        requestedCheckIn: requestedCheckIn ? new Date(requestedCheckIn) : null,
        requestedCheckOut: requestedCheckOut ? new Date(requestedCheckOut) : null,
        reason
      }
    });
    res.json(correction);
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit time correction' });
  }
});

// 8. ADMIN DASHBOARD ANALYTICS
app.get('/api/attendance/analytics', authenticateToken, requireRole(['super_admin', 'admin_hr']), async (req: any, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRecords = await prisma.attendance.findMany({
      where: { date: { gte: today } }
    });

    const totalUsers = await prisma.user.count({ where: { role: { not: 'super_admin' } } });
    const presentCount = todayRecords.length;
    const absentCount = Math.max(0, totalUsers - presentCount);

    const lateCount = todayRecords.filter(r => r.isLate).length;

    const completed = todayRecords.filter(r => r.status === 'COMPLETED' && r.workingHours);
    const avgHours = completed.length > 0
      ? completed.reduce((sum, r) => sum + (r.workingHours || 0), 0) / completed.length
      : 0;

    res.json({ present: presentCount, absent: absentCount, late: lateCount, avgHours: avgHours.toFixed(1) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ==========================================
// LEAVE QUOTA & MANAGEMENT ROUTES
// ==========================================

app.get('/api/leaves/balances', authenticateToken, async (req: any, res: Response) => {
  try {
    const balances = await prisma.leaveBalance.upsert({
      where: { userId: req.user.id },
      update: {},
      create: { userId: req.user.id }
    });
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leave balances' });
  }
});

app.get('/api/leaves', authenticateToken, async (req: any, res: Response) => {
  try {
    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin_hr';
    const whereClause = isAdmin ? {} : { userId: req.user.id };

    const leaves = await prisma.leaveRequest.findMany({
      where: whereClause,
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' }
    });

    res.json(leaves);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leaves' });
  }
});

app.post('/api/leaves', authenticateToken, async (req: any, res: Response) => {
  const { type, startDate, endDate, reason } = req.body;
  try {
    const leave = await prisma.leaveRequest.create({
      data: {
        userId: req.user.id,
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason
      }
    });
    await logActivity(req.user.id, 'CREATE', 'LEAVE', leave.id, `Applied for ${type} leave from ${startDate} to ${endDate}`);
    res.json(leave);
  } catch (error) {
    res.status(500).json({ error: 'Failed to apply for leave' });
  }
});

app.put('/api/leaves/:id/status', authenticateToken, requireRole(['super_admin', 'admin_hr']), async (req: any, res: Response) => {
  const { status } = req.body;
  try {
    const leave = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status, reviewedBy: req.user.id }
    });
    const leaveUser = await prisma.user.findUnique({ where: { id: leave.userId }, select: { name: true } });
    await logActivity(req.user.id, 'UPDATE', 'LEAVE', req.params.id, `${status} leave request for ${leaveUser?.name || 'employee'} (${leave.type}, ${format(new Date(leave.startDate), 'dd MMM')} – ${format(new Date(leave.endDate), 'dd MMM')})`);
    res.json(leave);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update leave status' });
  }
});

// ==========================================
// CRON JOB - AUTO CHECKOUT
// Note: Requires running `npm install node-cron`
// ==========================================
/*
import cron from 'node-cron';

// Runs at 11:59 PM every night
cron.schedule('59 23 * * *', async () => {
  console.log('Running Auto-Checkout Cron Job...');
  try {
    await prisma.attendance.updateMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] } },
      data: { status: 'AUTO_CLOSED' }
    });
  } catch (err) {
    console.error('Cron Error:', err);
  }
});
*/

// ==========================================
// CATALOGUE TRACKING ROUTES (FINAL)
// ==========================================

// 1. GET TRACKING HISTORY (Includes Return Date/Time)
app.get('/api/catalogs/tracking', authenticateToken, async (req: Request, res: Response) => {
  try {
    const movements = await prisma.catalogMovement.findMany({
      include: {
        copy: {
          include: {
            catalog: { include: { company: true } }
          }
        },
        inquiry: { select: { inquiry_number: true, client_name: true } },
        architect: { select: { name: true } },
        issuedByUser: { select: { name: true } } // <--- Handover Person
      },
      orderBy: { issueDate: 'desc' }
    });
    res.json(movements);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tracking data' });
  }
});

// 2. GET COPIES
app.get('/api/catalogs/copies', authenticateToken, async (req: Request, res: Response) => {
  try {
    const copies = await prisma.catalogCopy.findMany({
      include: {
        catalog: { include: { company: true } },
        movements: {
          where: { status: 'ISSUED' },
          take: 1,
          include: {
            inquiry: true,
            issuedByUser: { select: { name: true } }
          }
        }
      },
      orderBy: { copyNumber: 'asc' }
    });
    res.json(copies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch copies' });
  }
});

// 3. CREATE COPIES (Batch Generate)
app.post('/api/catalogs/:id/copies', authenticateToken, async (req: any, res: Response) => {
  const { id } = req.params;
  const { quantity } = req.body;

  try {
    const lastCopy = await prisma.catalogCopy.findFirst({
      where: { catalogId: id },
      orderBy: { copyNumber: 'desc' }
    });

    let startNum = lastCopy ? parseInt(lastCopy.copyNumber) : 0;
    const newCopiesData = [];

    for (let i = 1; i <= quantity; i++) {
      const numStr = (startNum + i).toString().padStart(3, '0');
      newCopiesData.push({
        catalogId: id,
        copyNumber: numStr,
        status: 'AVAILABLE'
      });
    }

    await prisma.catalogCopy.createMany({ data: newCopiesData });

    await logActivity(req.user.id, 'CREATE', 'CATALOG_COPY', id, `Added ${quantity} copies`);
    res.json({ message: 'Copies added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create copies' });
  }
});

// 4. ISSUE CATALOGUE (With Admin Override & Manual Date)
app.post('/api/catalogs/issue', authenticateToken, async (req: any, res: Response) => {
  const {
    copyId, inquiryId, architectId, clientName, remarks,
    issueDate,       // <--- Manual Date
    issuedByUserId   // <--- Admin Override
  } = req.body;

  try {
    // 1. Determine who is issuing (Admin can override, else it's the logged-in user)
    let finalIssuerId = req.user.id;
    if (req.user.role === 'super_admin' && issuedByUserId) {
      finalIssuerId = issuedByUserId;
    }

    // 2. Determine Date (Manual or Now)
    const finalIssueDate = issueDate ? new Date(issueDate) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Create Movement
      const movement = await tx.catalogMovement.create({
        data: {
          copyId,
          inquiryId: inquiryId || null,
          architectId: architectId || null,
          issuedByUserId: finalIssuerId,
          clientName,
          remarks,
          status: 'ISSUED',
          issueDate: finalIssueDate
        }
      });

      // Update Copy Status
      await tx.catalogCopy.update({
        where: { id: copyId },
        data: { status: 'ISSUED' }
      });

      return movement;
    });

    await logActivity(req.user.id, 'UPDATE', 'CATALOG_ISSUE', copyId, `Issued copy to ${clientName}`);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to issue catalogue' });
  }
});

// 5. RETURN CATALOGUE (With Manual Date)
app.put('/api/catalogs/return/:movementId', authenticateToken, async (req: any, res: Response) => {
  const { movementId } = req.params;
  const { returnDate } = req.body; // <--- Manual Date

  try {
    const movement = await prisma.catalogMovement.findUnique({ where: { id: movementId } });
    if (!movement) return res.status(404).json({ error: 'Movement not found' });

    // Determine Date (Manual or Now)
    const finalReturnDate = returnDate ? new Date(returnDate) : new Date();

    await prisma.$transaction(async (tx) => {
      // Close Movement
      await tx.catalogMovement.update({
        where: { id: movementId },
        data: {
          returnDate: finalReturnDate,
          status: 'RETURNED'
        }
      });

      // Free up Copy
      await tx.catalogCopy.update({
        where: { id: movement.copyId },
        data: { status: 'AVAILABLE' }
      });
    });

    await logActivity(req.user.id, 'UPDATE', 'CATALOG_RETURN', movement.copyId, `Returned catalogue`);
    res.json({ message: 'Returned successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to return catalogue' });
  }
});
// ==========================================
// 4. INQUIRY ROUTES
// ==========================================

// [EDITED] GET ALL INQUIRIES (With Role Filtering)
// Find this route in src/index.ts
app.get('/api/inquiries', authenticateToken, async (req: any, res: Response) => {
  try {
    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin_hr';
    const whereClause = isAdmin ? {} : { sales_person_id: req.user.id };

    const inquiries = await prisma.inquiry.findMany({
      where: whereClause,
      include: {
        sales_person: { select: { name: true } },
        sales_persons: { select: { id: true, name: true } }, // <--- ADD THIS LINE
        architect: { select: { id: true, name: true } },
        selections: { select: { id: true, selection_number: true, status: true } },
        _count: { select: { comments: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    const formatted = inquiries.map((i: any) => ({
      ...i,
      profiles: i.sales_person,
      sales_persons: i.sales_persons, // <--- ADD THIS LINE
      stage: i.stage,
      priority: i.priority
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inquiries' });
  }
});

// Add this to your backend inquiry routes
app.put('/api/inquiries/:id/future-reference', authenticateToken, requireRole(['super_admin', 'sales_manager']), async (req: any, res: Response) => {
  try {
    // Only super_admin and sales_manager can write future-reference notes.

    const { future_reference } = req.body;
    
    const updatedInquiry = await prisma.inquiry.update({
      where: { id: req.params.id },
      data: { 
        future_reference: future_reference,
        future_reference_updated_at: new Date() // Sets the exact date and time
      }
    });

    res.json({
      future_reference: updatedInquiry.future_reference,
      future_reference_updated_at: updatedInquiry.future_reference_updated_at
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save future reference" });
  }
});


// UPDATE POST /api/inquiries
app.post('/api/inquiries', authenticateToken, async (req: any, res: Response) => {
  const {
    client_name, architect_id_name, architectId, mobile_number, inquiry_date, address,
    sales_person_id, expected_final_date,
    client_birth_date, client_anniversary_date, // <--- New Fields
    orderIndex: requestedOrderIndex // <--- Pipeline position
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

    // Determine orderIndex: use provided value or place at end
    let finalOrderIndex = requestedOrderIndex;
    if (finalOrderIndex === undefined || finalOrderIndex === null) {
      const maxResult = await prisma.inquiry.aggregate({
        where: { stage: req.body.stage || 'Inquiry' },  // scoped to that column
        _max: { orderIndex: true }
      });
      finalOrderIndex = (maxResult._max.orderIndex ?? 0) + 1000;
    }

    const newInquiry = await prisma.inquiry.create({
      data: {
        inquiry_number: inquiryNumber,
        client_name,
        architect_id_name, // Manual name
        architectId: architectId || null, // Linked ID
        mobile_number,
        inquiry_date: new Date(inquiry_date),
        address,
        sales_person_id: sales_person_id || req.user.id,
        expected_final_date: expected_final_date ? new Date(expected_final_date) : null,
        client_birth_date: client_birth_date ? new Date(client_birth_date) : null,
        client_anniversary_date: client_anniversary_date ? new Date(client_anniversary_date) : null,
        created_by_id: req.user.id,
        orderIndex: finalOrderIndex,
      }
    });

    await logActivity(req.user.id, 'CREATE', 'INQUIRY', newInquiry.id, `Created Inquiry #${newInquiry.inquiry_number}`);

    res.json(newInquiry);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create inquiry' });
  }
});

// UPDATE PUT /api/inquiries/:id
app.put('/api/inquiries/:id', authenticateToken, async (req: any, res: Response) => {
  const { id } = req.params;
  const data = req.body;

  // Handle Dates
  if (data.inquiry_date) data.inquiry_date = new Date(data.inquiry_date);
  if (data.expected_final_date) data.expected_final_date = new Date(data.expected_final_date);
  else if (data.expected_final_date === '') data.expected_final_date = null;

  // New Dates
  if (data.client_birth_date) data.client_birth_date = new Date(data.client_birth_date);
  else if (data.client_birth_date === '') data.client_birth_date = null;

  if (data.client_anniversary_date) data.client_anniversary_date = new Date(data.client_anniversary_date);
  else if (data.client_anniversary_date === '') data.client_anniversary_date = null;

  // Fix: Assign architectId to null if empty string to avoid Prisma 500 error on UUID
  if (data.architectId === '') {
    data.architectId = null;
  }

  delete data.product_category;

  try {
    const updated = await prisma.inquiry.update({ where: { id }, data: data });
    await logActivity(req.user.id, 'UPDATE', 'INQUIRY', id, `Updated Inquiry #${updated.inquiry_number}`);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update inquiry' });
  }
});
// DELETE INQUIRY (Fixed: Fetch 'inquiry' before deleting)
app.delete('/api/inquiries/:id', authenticateToken, async (req: any, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  try {
    // 1. Fetch first so we have the number for the log
    const inquiry = await prisma.inquiry.findUnique({ where: { id } });
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });

    // 2. Approval gate: if the inquiry has already moved into measurement /
    // selection (i.e. it has at least one Selection), a non-super-admin can only
    // REQUEST deletion. Super admins always delete directly.
    const selectionCount = await prisma.selection.count({ where: { inquiryId: id } });
    const needsApproval = req.user.role !== 'super_admin' && selectionCount > 0;

    if (needsApproval) {
      // Don't delete — create (or reuse) a pending request for super admin review.
      const existing = await prisma.inquiryDeletionRequest.findFirst({
        where: { inquiryId: id, status: 'PENDING' },
      });

      if (existing) {
        return res.json({ pendingApproval: true, message: 'A deletion request for this inquiry is already pending Super Admin approval.' });
      }

      const request = await prisma.inquiryDeletionRequest.create({
        data: {
          inquiryId: id,
          inquiryNumber: inquiry.inquiry_number,
          clientName: inquiry.client_name,
          requestedById: req.user.id,
          reason: reason || null,
          status: 'PENDING',
        },
      });

      await logActivity(req.user.id, 'CREATE', 'DELETION_REQUEST', request.id, `Requested deletion of Inquiry #${inquiry.inquiry_number} (awaiting Super Admin approval)`);

      return res.json({ pendingApproval: true, message: 'Deletion request sent to Super Admin for approval.' });
    }

    // 3. Direct delete (super admin, or a plain inquiry with no selection yet).
    await prisma.selection.deleteMany({ where: { inquiryId: id } });
    await prisma.inquiry.delete({ where: { id } });

    // [LOG]
    await logActivity(req.user.id, 'DELETE', 'INQUIRY', id, `Deleted Inquiry #${inquiry?.inquiry_number || 'Unknown'} and all associated records`);

    res.json({ message: 'Deleted inquiry and associated records' });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({ error: 'Failed to delete inquiry' });
  }
});

// ==========================================
// INQUIRY DELETION APPROVAL ROUTES (Super Admin only)
// ==========================================

// List pending deletion requests
app.get('/api/deletion-requests', authenticateToken, requireRole(['super_admin']), async (_req: any, res: Response) => {
  try {
    const requests = await prisma.inquiryDeletionRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true, role: true } },
      },
    });
    res.json(requests);
  } catch (error) {
    console.error('List Deletion Requests Error:', error);
    res.status(500).json({ error: 'Failed to load deletion requests' });
  }
});

// Approve a deletion request → actually delete the inquiry
app.put('/api/deletion-requests/:id/approve', authenticateToken, requireRole(['super_admin']), async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const request = await prisma.inquiryDeletionRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ error: 'Deletion request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: 'This request has already been reviewed.' });

    // Perform the real delete (same as a direct super-admin delete).
    await prisma.selection.deleteMany({ where: { inquiryId: request.inquiryId } });
    // The request row itself cascades away with the inquiry, so capture what we need first.
    await prisma.inquiry.delete({ where: { id: request.inquiryId } });

    await logActivity(req.user.id, 'DELETE', 'INQUIRY', request.inquiryId, `Approved deletion of Inquiry #${request.inquiryNumber} (requested by ${request.requestedById})`);

    res.json({ message: `Inquiry #${request.inquiryNumber} deleted.`, inquiryId: request.inquiryId });
  } catch (error) {
    console.error('Approve Deletion Error:', error);
    res.status(500).json({ error: 'Failed to approve deletion' });
  }
});

// Reject a deletion request → keep the inquiry, mark request REJECTED
app.put('/api/deletion-requests/:id/reject', authenticateToken, requireRole(['super_admin']), async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const request = await prisma.inquiryDeletionRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ error: 'Deletion request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: 'This request has already been reviewed.' });

    await prisma.inquiryDeletionRequest.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById: req.user.id },
    });

    await logActivity(req.user.id, 'UPDATE', 'DELETION_REQUEST', id, `Rejected deletion of Inquiry #${request.inquiryNumber}`);

    res.json({ message: `Deletion request for #${request.inquiryNumber} rejected.`, id });
  } catch (error) {
    console.error('Reject Deletion Error:', error);
    res.status(500).json({ error: 'Failed to reject deletion' });
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
          orderBy: { orderIndex: 'asc' }
        },
        created_by: { select: { name: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    // ✅ Lift srlNo, catalogName, catalogType, companyId from details JSON to top-level fields
    const mapped = selections.map((sel: any) => ({
      ...sel,
      items: (sel.items || []).map((item: any) => ({
        ...item,
        srlNo: item.srlNo ?? (item.details?.srlNo || ''),
        catalogName: item.catalogName ?? (item.details?.catalogName || ''),
        catalogType: item.catalogType ?? (item.details?.catalogType || ''),
        companyId: item.companyId ?? (item.details?.companyId || ''),
        areaName: item.areaName ?? (item.details?.areaName || '')
      }))
    }));

    res.json(mapped);
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
          include: { product: true },
          orderBy: [{ version: 'asc' }, { orderIndex: 'asc' }]
        },
        created_by: { select: { name: true } }
      }
    });

    if (!selection) {
      return res.status(404).json({ error: 'Selection not found' });
    }

    // ✅ Lift srlNo, catalogName, catalogType, companyId from details JSON to top-level fields
    const mapped = {
      ...selection,
      items: (selection.items || []).map((item: any) => ({
        ...item,
        srlNo: item.srlNo ?? (item.details?.srlNo || ''),
        catalogName: item.catalogName ?? (item.details?.catalogName || ''),
        catalogType: item.catalogType ?? (item.details?.catalogType || ''),
        companyId: item.companyId ?? (item.details?.companyId || ''),
        areaName: item.areaName ?? (item.details?.areaName || '')
      }))
    };

    res.json(mapped);
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
          orderBy: [{ version: 'asc' }, { orderIndex: 'asc' }]
        },
        created_by: { select: { name: true } }
      }
    });

    if (!selection) {
      return res.status(404).json({ error: 'No selection found for this inquiry' });
    }

    // ✅ Lift srlNo, catalogName, catalogType, companyId from details JSON to top-level fields
    const mapped = {
      ...selection,
      items: (selection.items || []).map((item: any) => ({
        ...item,
        srlNo: item.srlNo ?? (item.details?.srlNo || ''),
        catalogName: item.catalogName ?? (item.details?.catalogName || ''),
        catalogType: item.catalogType ?? (item.details?.catalogType || ''),
        companyId: item.companyId ?? (item.details?.companyId || ''),
        areaName: item.areaName ?? (item.details?.areaName || '')
      }))
    };

    res.json(mapped);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch selection' });
  }
});

app.post('/api/selections', authenticateToken, async (req: any, res: Response) => {
  const { inquiryId, delivery_date, notes, items, status } = req.body;

  try {
    // ✅ CRITICAL FIX: Check if a selection already exists for this inquiry.
    // If yes, UPDATE it (replace current version items) instead of creating a duplicate.
    const existingSelection = await prisma.selection.findFirst({
      where: { inquiryId },
      include: { items: true }
    });

    if (existingSelection) {
      console.log(`⚡ Selection already exists for inquiry ${inquiryId}. Updating existing selection ${existingSelection.id} instead of creating new.`);

      const currentVersion = existingSelection.version || 1;

      // Delete only current-version items to replace them
      await prisma.selectionItem.deleteMany({
        where: { selectionId: existingSelection.id, version: currentVersion }
      });

      // Validate product IDs
      let validProductIds = new Set<string>();
      const potentialIds = (items || []).map((i: any) => i.productId).filter((pid: any) => pid && typeof pid === 'string' && !pid.startsWith('temp-') && pid !== 'manual');
      if (potentialIds.length > 0) {
        const foundProducts = await prisma.product.findMany({ where: { id: { in: potentialIds } }, select: { id: true } });
        foundProducts.forEach(p => validProductIds.add(p.id));
      }

      if (items && items.length > 0) {
        const itemsToCreate = items.map((item: any, index: number) => ({
          selectionId: existingSelection.id,
          version: currentVersion,
          productId: (item.productId && validProductIds.has(item.productId)) ? item.productId : null,
          productName: item.name || item.productName || 'Custom Item',
          quantity: parseFloat(item.quantity) || 1,
          price: parseFloat(item.price) || 0,
          total: (parseFloat(item.quantity) || 1) * (parseFloat(item.price) || 0),
          calculationType: item.calculationType || 'Local',
          unit: item.unit || 'mm',
          width: item.width ? parseFloat(item.width) : null,
          height: item.height ? parseFloat(item.height) : null,
          type: item.type || null,
          motorizationMode: item.motorizationMode || null,
          opsType: item.opsType || null,
          pelmet: item.pelmet ? parseFloat(item.pelmet) : null,
          openingType: item.openingType || null,
          orderIndex: item.orderIndex !== undefined ? item.orderIndex : index,
          details: {
            ...(item.details || {}),
            areaName: item.areaName || item.details?.areaName || '',
            catalogName: item.catalogName || item.details?.catalogName || '',
            catalogType: item.catalogType || item.details?.catalogType || '',
            companyId: item.companyId || item.details?.companyId || '',
            srlNo: item.srlNo || item.details?.srlNo || ''
          }
        }));
        await prisma.selectionItem.createMany({ data: itemsToCreate });
      }

      await prisma.selection.update({
        where: { id: existingSelection.id },
        data: {
          status: status || existingSelection.status,
          delivery_date: delivery_date ? new Date(delivery_date) : existingSelection.delivery_date,
          notes: notes !== undefined ? notes : existingSelection.notes,
        }
      });

      const updated = await prisma.selection.findUnique({
        where: { id: existingSelection.id },
        include: { items: { orderBy: [{ version: 'asc' }, { orderIndex: 'asc' }] }, inquiry: true }
      });

      await logActivity(req.user.id, 'UPDATE', 'SELECTION', existingSelection.id, `Updated Selection #${existingSelection.selection_number} via Measurement Editor`);
      return res.json(updated);
    }

    // ── No existing selection: create fresh ──
    console.log('📥 Creating New Selection:', { inquiryId, itemsCount: items?.length });

    const date = new Date();
    const yearMonth = `${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1).toString().padStart(2, '0')}`;

    const counterRecord = await prisma.selectionCounter.upsert({
      where: { year_month: yearMonth },
      update: { counter: { increment: 1 } },
      create: { year_month: yearMonth, counter: 1 },
    });

    const selectionNumber = `SEL-${yearMonth}${counterRecord.counter.toString().padStart(4, '0')}`;

    const mapItem = (item: any, index: number) => {
      const calculationType = item.calculationType || 'Local';
      return {
        productId: item.id || item.productId || null,
        productName: item.name || item.productName || 'Custom Item',
        quantity: parseFloat(item.quantity) || 1,
        price: parseFloat(item.price) || 0,
        total: (parseFloat(item.quantity) || 1) * (parseFloat(item.price) || 0),
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
          catalogType: item.catalogType || item.details?.catalogType || '',
          srlNo: item.srlNo || item.details?.srlNo || ''
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
        items: { create: items.map(mapItem) }
      },
      include: { items: true, inquiry: true }
    });

    await logActivity(req.user.id, 'CREATE', 'SELECTION', newSelection.id, `Created Selection #${newSelection.selection_number}`);
    res.json(newSelection);
  } catch (error) {
    console.error('❌ Selection creation error:', error);
    res.status(500).json({ error: 'Failed to create selection' });
  }
});
// [In src/index.ts]

app.put('/api/selections/:id', authenticateToken, async (req: any, res: Response) => {
  const { id } = req.params;
  // ✅ Extract the createNewVersion flag AND editVersion from the request body
  const { status, delivery_date, notes, items, createNewVersion, editVersion } = req.body;

  try {
    console.log(`🔥 Update Request for Selection ${id} | New Version Mode: ${!!createNewVersion}`);

    // ==================================================================
    // 🛡️ STEP 0: VALIDATE PRODUCT IDs
    // Check which IDs sent from frontend actually exist in the Product table.
    // ==================================================================
    let validProductIds = new Set<string>();

    if (items && Array.isArray(items)) {
      const potentialIds = items
        .map((i: any) => i.productId)
        .filter((pid: any) =>
          pid &&
          typeof pid === 'string' &&
          !pid.startsWith('temp-') &&
          pid !== 'manual'
        );

      if (potentialIds.length > 0) {
        const foundProducts = await prisma.product.findMany({
          where: { id: { in: potentialIds } },
          select: { id: true }
        });
        foundProducts.forEach(p => validProductIds.add(p.id));
      }
    }

    // ==================================================================
    // STEP 1: FETCH CURRENT SELECTION DATA
    // ==================================================================
    const currentSelection = await prisma.selection.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!currentSelection) {
      return res.status(404).json({ error: "Selection not found" });
    }

    // Default to current version if field is null
    const currentVersion = currentSelection.version || 1;
    let versionToSave = currentVersion;

    // ==================================================================
    // STEP 2: DETERMINE VERSION LOGIC
    // ==================================================================
    if (createNewVersion) {
      // ✅ CASE A: NEW VERSION (Add More)
      // Increment version number
      versionToSave = currentVersion + 1;

      // We do NOT delete existing items. We strictly APPEND the new items to history.
      console.log(`✨ Creating New Version: v${versionToSave}`);
    } else if (editVersion && typeof editVersion === 'number') {
      // ✅ CASE B: EDITING A SPECIFIC HISTORICAL VERSION
      versionToSave = editVersion;
      console.log(`✏️ Editing Historical Version: v${versionToSave}`);

      await prisma.selectionItem.deleteMany({
        where: {
          selectionId: id,
          version: versionToSave
        }
      });
    } else {
      // ✅ CASE C: STANDARD EDIT (current version)
      // We wipe items ONLY for the current active version to replace them.
      // Older versions (history) remain untouched.
      console.log(`✏️ Editing Current Version: v${versionToSave}`);

      await prisma.selectionItem.deleteMany({
        where: {
          selectionId: id,
          version: versionToSave
        }
      });
    }

    // ==================================================================
    // STEP 3: PREPARE ITEMS FOR SAVING
    // ==================================================================
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsToCreate = items.map((item: any, index: number) => {

        // Logic to preserve or default calculation type
        const rawProductId = (item.productId && !String(item.productId).startsWith('temp-')) ? item.productId : 'manual';
        const areaKey = item.details?.areaName || item.areaName || '';
        const calculationType = item.calculationType || 'Local';

        // Determine correct product ID (DB safe)
        const dbSafeProductId = (item.productId && validProductIds.has(item.productId))
          ? item.productId
          : null;

        return {
          selectionId: id,

          // ✅ Save with the calculated version
          version: versionToSave,

          productId: dbSafeProductId,
          productName: item.productName || item.name || 'Custom Item',
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

          orderIndex: item.orderIndex !== undefined ? item.orderIndex : index,

          details: {
            ...(item.details || {}),
            // ✅ Explicit fields AFTER spread so they are never overwritten by stale details data
            areaName: item.areaName || item.details?.areaName || '',
            catalogName: item.catalogName || item.details?.catalogName || '',
            catalogType: item.catalogType || item.details?.catalogType || '',
            companyId: item.companyId || item.details?.companyId || '',
            srlNo: item.srlNo || item.details?.srlNo || ''
          }
        };
      });

      // Bulk insert the new items
      await prisma.selectionItem.createMany({
        data: itemsToCreate
      });
    }

    // ==================================================================
    // STEP 4: UPDATE SELECTION METADATA
    // ==================================================================
    await prisma.selection.update({
      where: { id },
      data: {
        status: status || currentSelection.status,
        delivery_date: delivery_date ? new Date(delivery_date) : currentSelection.delivery_date,
        notes: notes || currentSelection.notes,
        // Only update version pointer when creating a NEW version, not when editing historical ones
        version: createNewVersion ? versionToSave : (currentSelection.version || 1)
      }
    });

    // ==================================================================
    // STEP 5: RETURN UPDATED DATA
    // ==================================================================
    const updated = await prisma.selection.findUnique({
      where: { id },
      include: {
        // Order by Version then Index so they appear in correct history order
        items: {
          orderBy: [
            { version: 'asc' },
            { orderIndex: 'asc' }
          ]
        },
        inquiry: true
      }
    });

    // Log for Admin
    const actionText = createNewVersion
      ? `Added items to create Version ${versionToSave}`
      : editVersion
        ? `Edited historical Version ${versionToSave}`
        : `Updated existing Version ${versionToSave}`;

    await logActivity(req.user.id, 'UPDATE', 'SELECTION', id, actionText);

    res.json(updated);

  } catch (error) {
    console.error('❌ Selection update error:', error);
    res.status(500).json({ error: 'Failed to update selection' });
  }
});
app.delete('/api/selections/:id', authenticateToken, async (req: any, res: Response) => {
  try {
    await prisma.selection.delete({ where: { id: req.params.id } });
    await logActivity(req.user.id, 'DELETE', 'SELECTION', req.params.id, `Deleted Selection #${req.params.id}`);
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

    await logActivity(req.user.id, 'CREATE', 'CALCULATION', calculation.id, `Saved standard calculation for Selection ${selectionId}`);
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
          orderBy: { id: 'asc' } // Keep insertion order
        }
      }
    });

    if (deepCalc && deepCalc.items.length > 0) {
      // Filter for Local and Roman items
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

// [Inside src/index.ts]


app.post('/api/calculations/deep/:selectionId', authenticateToken, async (req: any, res: Response) => {
  const { selectionId } = req.params;
  const { items } = req.body;

  try {
    const deepCalc = await prisma.deepCalculation.upsert({
      where: { selectionId },
      // UPDATE BLOCK
      update: {
        items: {
          deleteMany: {},
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            category: item.category || 'Local',

            // 🔥 ADD VARIANT FIELD
            variant: item.variant || 'Normal',

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

            hasFabric: Boolean(item.hasFabric),
            hasBlackout: Boolean(item.hasBlackout),
            hasSheer: Boolean(item.hasSheer),
            hasChannel: Boolean(item.hasChannel),
            hasLabour: Boolean(item.hasLabour),
            hasFitting: Boolean(item.hasFitting)
          }))
        }
      },
      // CREATE BLOCK
      create: {
        selectionId,
        items: {
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            category: item.category || 'Local',

            // 🔥 ADD VARIANT FIELD
            variant: item.variant || 'Normal',

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

            hasFabric: Boolean(item.hasFabric),
            hasBlackout: Boolean(item.hasBlackout),
            hasSheer: Boolean(item.hasSheer),
            hasChannel: Boolean(item.hasChannel),
            hasLabour: Boolean(item.hasLabour),
            hasFitting: Boolean(item.hasFitting)
          }))
        }
      }
    });

    await logActivity(req.user.id, 'UPDATE', 'CALCULATION', selectionId, `Saved DEEP calculation for Selection`);
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
      item.calculationType && item.calculationType.split(',').includes('Somfy')
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
app.post('/api/calculations/somfy/:selectionId', authenticateToken, async (req: any, res: Response) => {
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
    await logActivity(req.user.id, 'UPDATE', 'CALCULATION', selectionId, `Saved SOMFY calculation for Selection`);
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
app.post('/api/calculations/local/:selectionId', authenticateToken, async (req: any, res: Response) => {
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
    await logActivity(req.user.id, 'UPDATE', 'CALCULATION', selectionId, `Saved LOCAL calculation & measurements for Selection`);

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
app.post('/api/calculations/forest/:selectionId', authenticateToken, async (req: any, res: Response) => {
  const { selectionId } = req.params;
  const { items } = req.body;

  try {
    // Resolve each row to a real SelectionItem:
    //  - manually-added rows (isNew / "new-" temp id) get a SelectionItem created
    //  - existing rows get their dimensions / area name / gsm updated
    const resolvedItems: any[] = [];
    let nextOrderIndex: number | null = null;

    for (const item of items) {
      const isNew = item.isNew || !item.selectionItemId || String(item.selectionItemId).startsWith('new-');

      if (isNew) {
        if (nextOrderIndex === null) {
          const last = await prisma.selectionItem.findFirst({
            where: { selectionId },
            orderBy: { orderIndex: 'desc' },
            select: { orderIndex: true }
          });
          nextOrderIndex = (last?.orderIndex ?? -1) + 1;
        }

        const created = await prisma.selectionItem.create({
          data: {
            selectionId,
            orderIndex: nextOrderIndex++,
            productName: item.areaName?.trim() || 'Manual Area',
            calculationType: 'Forest (Auto)',
            unit: item.unit || 'mm',
            width: parseFloat(item.width || 0),
            height: parseFloat(item.height || 0),
            details: { areaName: item.areaName?.trim() || 'Area', gsm: parseFloat(item.gsm || 0) }
          }
        });

        resolvedItems.push({ ...item, selectionItemId: created.id });
      } else {
        const existing = await prisma.selectionItem.findUnique({ where: { id: item.selectionItemId } });
        if (existing) {
          const mergedDetails = {
            ...((existing.details as any) || {}),
            areaName: item.areaName?.trim() || (existing.details as any)?.areaName || 'Area',
            gsm: parseFloat(item.gsm || 0)
          };
          await prisma.selectionItem.update({
            where: { id: item.selectionItemId },
            data: {
              width: item.width !== undefined ? parseFloat(item.width || 0) : existing.width,
              height: item.height !== undefined ? parseFloat(item.height || 0) : existing.height,
              details: mergedDetails
            }
          });
        }
        resolvedItems.push(item);
      }
    }

    const forestCalc = await prisma.forestCalculation.upsert({
      where: { selectionId },
      update: {
        items: {
          deleteMany: {},
          create: resolvedItems.map((item: any) => ({
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
          create: resolvedItems.map((item: any) => ({
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
    await logActivity(req.user.id, 'UPDATE', 'CALCULATION', selectionId, `Saved FOREST calculation for Selection`);
    res.json(forestCalc);
  } catch (error) {
    console.error('Error saving forest calculation:', error);
    res.status(500).json({ error: 'Failed to save forest calculation' });
  }
});


// [APPEND TO src/index.ts]

// ==========================================
// GPW CALCULATION ROUTES (Gravel/Pulse/Weave)
// ==========================================

app.get('/api/calculations/gpw/:selectionId', authenticateToken, async (req: Request, res: Response) => {
  const { selectionId } = req.params;
  try {
    // 1. Fetch saved GPW calculation
    const gpwCalc = await prisma.gpwCalculation.findUnique({
      where: { selectionId },
      include: {
        items: {
          include: { selectionItem: true }
        }
      }
    });

    // 2. Fetch Selection items to check for new assignments
    const selection = await prisma.selection.findUnique({
      where: { id: selectionId },
      include: {
        items: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    if (!selection) return res.status(404).json({ error: 'Selection not found' });

    // 3. Filter items assigned to 'GPW'
    const relevantItems = selection.items.filter(item =>
      item.calculationType && item.calculationType.includes('GPW')
    );

    // 4. Merge Logic
    const mergedItems = relevantItems.map(item => {
      const savedItem = gpwCalc?.items.find(si => si.selectionItemId === item.id);

      if (savedItem) {
        return { ...savedItem, selectionItem: item };
      }

      // Default Structure for new items
      return {
        selectionItemId: item.id,
        selectionItem: item,
        type: 'Gravel', // Default
        rft: 0,
        trackPrice: 0, trackGst: 0, trackFinal: 0,
        motorPrice: 0, motorGst: 0, motorFinal: 0,
        remotePrice: 0, remoteGst: 0, remoteFinal: 0
      };
    });

    res.json({
      id: gpwCalc?.id || null,
      selectionId,
      items: mergedItems
    });

  } catch (error) {
    console.error("GPW Fetch Error:", error);
    res.status(500).json({ error: 'Failed to fetch GPW calculation' });
  }
});

app.post('/api/calculations/gpw/:selectionId', authenticateToken, async (req: any, res: Response) => {
  const { selectionId } = req.params;
  const { items } = req.body;

  try {
    // Update widths first if changed in UI
    for (const item of items) {
      if (item.selectionItemId && item.width !== undefined) {
        await prisma.selectionItem.update({
          where: { id: item.selectionItemId },
          data: {
            width: parseFloat(item.width || 0),
            height: parseFloat(item.height || 0),
            unit: item.unit
          }
        });
      }
    }

    const gpwCalc = await prisma.gpwCalculation.upsert({
      where: { selectionId },
      update: {
        items: {
          deleteMany: {},
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            type: item.type || 'Gravel',
            rft: parseFloat(item.rft || 0),

            trackPrice: parseFloat(item.trackPrice || 0),
            trackGst: parseFloat(item.trackGst || 0),
            trackFinal: parseFloat(item.trackFinal || 0),

            motorPrice: parseFloat(item.motorPrice || 0),
            motorGst: parseFloat(item.motorGst || 0),
            motorFinal: parseFloat(item.motorFinal || 0),

            remotePrice: parseFloat(item.remotePrice || 0),
            remoteGst: parseFloat(item.remoteGst || 0),
            remoteFinal: parseFloat(item.remoteFinal || 0),
          }))
        }
      },
      create: {
        selectionId,
        items: {
          create: items.map((item: any) => ({
            selectionItemId: item.selectionItemId,
            type: item.type || 'Gravel',
            rft: parseFloat(item.rft || 0),

            trackPrice: parseFloat(item.trackPrice || 0),
            trackGst: parseFloat(item.trackGst || 0),
            trackFinal: parseFloat(item.trackFinal || 0),

            motorPrice: parseFloat(item.motorPrice || 0),
            motorGst: parseFloat(item.motorGst || 0),
            motorFinal: parseFloat(item.motorFinal || 0),

            remotePrice: parseFloat(item.remotePrice || 0),
            remoteGst: parseFloat(item.remoteGst || 0),
            remoteFinal: parseFloat(item.remoteFinal || 0),
          }))
        }
      }
    });

    await logActivity(req.user.id, 'UPDATE', 'CALCULATION', selectionId, `Saved GPW calculation`);
    res.json(gpwCalc);
  } catch (error) {
    console.error('GPW Save Error:', error);
    res.status(500).json({ error: 'Failed to save GPW calculation' });
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

    await logActivity(req.user.id, 'CREATE', 'QUOTATION', quotation.id, `Created Quotation #${quotation.quotation_number}`);
    res.json(quotation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create quotation' });
  }
});
// ==========================================
// QUOTATION ROUTES - CLEANED UP

// [FILE: src/index.ts]

// 1. LIST QUOTATIONS (Filtered by Role & Assignment)
app.get('/api/quotations', authenticateToken, async (req: any, res: Response) => {
  try {
    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin_hr';

    // ✅ FIX: Allow agents to see quotes if they are assigned to the Inquiry
    const whereClause = isAdmin ? {} : {
      OR: [
        // 1. I created the quotation
        { created_by_id: req.user.id },

        // 2. OR: The quotation belongs to an inquiry I OWN (Main Sales Person)
        {
          selection: {
            inquiry: {
              sales_person_id: req.user.id
            }
          }
        },

        // 3. OR: The quotation belongs to an inquiry where I am a COLLABORATOR
        {
          selection: {
            inquiry: {
              sales_persons: {
                some: { id: req.user.id }
              }
            }
          }
        }
      ]
    };

    const quotes = await prisma.quotation.findMany({
      where: whereClause, // Apply the smart filter
      include: {
        selection: {
          include: {
            inquiry: {
              include: { sales_person: { select: { name: true } } }
            }
          }
        },
        created_by: { select: { name: true } },
        labels: true,
        _count: { select: { comments: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    res.json(quotes);
  } catch (error) {
    console.error("Error fetching quotations:", error);
    res.status(500).json({ error: 'Failed to fetch quotations' });
  }
});

app.post('/api/quotations/generate', authenticateToken, async (req: any, res: Response) => {
  const { selectionId, quotationType } = req.body;

  if (!selectionId) {
    return res.status(400).json({ error: 'Selection ID is required' });
  }

  try {
    console.log('🔵 Generating quotation for selection:', selectionId);

    // 1. FETCH SELECTION WITH ALL DATA
    const selection = await prisma.selection.findUnique({
      where: { id: selectionId },
      include: {
        inquiry: { include: { sales_person: true } },
        items: {
          include: {
            product: { include: { catalog: { include: { company: true } } } }
          }
        },
        deepCalculation: {
          include: {
            items: {
              include: {
                selectionItem: {
                  include: {
                    product: { include: { catalog: { include: { company: true } } } }
                  }
                }
              }
            }
          }
        },
        forestCalculation: { include: { items: { include: { selectionItem: true } } } },
        somfyCalculation: { include: { items: { include: { selectionItem: true } } } }
      }
    });

    if (!selection) return res.status(404).json({ error: 'Selection not found' });

    // 2. GENERATE QUOTE NUMBER
    const date = new Date();
    const yearMonth = `${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1).toString().padStart(2, '0')}`;

    const counterRecord = await prisma.quotationCounter.upsert({
      where: { year_month: yearMonth },
      update: { counter: { increment: 1 } },
      create: { year_month: yearMonth, counter: 1 },
    });

    const quoteNumber = `QT-${yearMonth}${counterRecord.counter.toString().padStart(4, '0')}`;

    // 3. AGGREGATE ITEMS
    const deepCalcItems = selection.deepCalculation?.items || [];
    const mainItemsMap = new Map<string, any>(); // Stores Fabric & Sheer items

    let totalBlackoutQty = 0;
    let blackoutRate = 0;

    let totalChannelCost = 0;
    let totalLabourCost = 0;
    let totalFittingCost = 0;

    const specializedHardwareItems: any[] = [];

    // --- LOOP THROUGH ALL DEEP CALC ITEMS ---
    for (const deepItem of deepCalcItems) {
      const selItem = deepItem.selectionItem;
      const product = selItem?.product;
      const rawDetails = selItem?.details as any;

      // ✅ 1. DYNAMIC AREA NAME (Handles M+S Split)
      let areaName = rawDetails?.areaName || (selItem as any)?.areaName || 'Area';
      if (deepItem.variant === 'Main') {
        areaName = areaName.replace(/\(M\+S\)/gi, '').trim() + ' (Main)';
      } else if (deepItem.variant === 'Sheer') {
        areaName = areaName.replace(/\(M\+S\)/gi, '').trim() + ' (Sheer)';
      }

      const prodName = product?.name || selItem?.productName || 'Custom Item';
      const catalogName = product?.catalog?.name || rawDetails?.catalogName || '';
      const productIdOrName = product ? product.id : prodName;

      // ✅ 2. HANDLE FABRIC (The "Main" material)
      if (Number(deepItem.fabric) > 0) {
        const key = `${productIdOrName}_${areaName}_Fabric`; // Unique key

        if (mainItemsMap.has(key)) {
          mainItemsMap.get(key).quantity += Number(deepItem.fabric);
        } else {
          mainItemsMap.set(key, {
            areaName: areaName,
            description: `${areaName} - ${prodName === 'Custom Item' ? 'Fabric' : prodName}`,
            catalogName: catalogName,
            quantity: Number(deepItem.fabric),
            unit: 'Mtr',
            unitPrice: Number(deepItem.fabricRate),
            gstPercent: 12
          });
        }
      }

      // ✅ 3. HANDLE SHEER (Crucial Fix: Treat Sheer Qty as a Line Item)
      // This ensures "Living Room (Sheer)" gets added even if fabric is 0
      if (Number(deepItem.sheer) > 0) {
        const key = `${productIdOrName}_${areaName}_Sheer`; // Distinct key so it doesn't merge with fabric

        // Determine label: If the row is explicitly "Sheer" variant, call it Fabric/Product Name
        // If it's a Normal row with sheer added, call it "Sheer"
        let label = prodName === 'Custom Item' ? 'Sheer' : prodName;
        if (deepItem.variant === 'Sheer') {
          label = prodName === 'Custom Item' ? 'Fabric' : prodName;
        }

        if (mainItemsMap.has(key)) {
          mainItemsMap.get(key).quantity += Number(deepItem.sheer);
        } else {
          mainItemsMap.set(key, {
            areaName: areaName,
            description: `${areaName} - ${label}`,
            catalogName: catalogName,
            quantity: Number(deepItem.sheer),
            unit: 'Mtr',
            unitPrice: Number(deepItem.sheerRate), // Use Sheer Rate
            gstPercent: 12
          });
        }
      }

      // ✅ 4. AGGREGATE BLACKOUT (Global Lining)
      if (Number(deepItem.blackout) > 0) {
        totalBlackoutQty += Number(deepItem.blackout);
        blackoutRate = Number(deepItem.blackoutRate);
      }

      // ✅ 5. AGGREGATE HARDWARE COSTS
      if (deepItem.channel > 0) totalChannelCost += Number(deepItem.channel) * Number(deepItem.channelRate);
      if (deepItem.labour > 0) totalLabourCost += Number(deepItem.labour) * Number(deepItem.labourRate);
      if (deepItem.fitting > 0) totalFittingCost += Number(deepItem.fitting) * Number(deepItem.fittingRate);
    }

    // --- HARDWARE FROM FOREST / SOMFY ---
    const addHardware = (items: any[], type: string) => {
      if (!items) return;
      items.forEach((item: any) => {
        const details = item.selectionItem?.details as any;
        const area = details?.areaName || 'Area';
        if (Number(item.trackFinal) > 0) specializedHardwareItems.push({ description: `${area} - ${type} Track`, quantity: 1, unit: 'Set', unitPrice: Number(item.trackFinal), gstPercent: 18 });
        if (Number(item.motorFinal) > 0) specializedHardwareItems.push({ description: `${area} - ${type} Motor`, quantity: 1, unit: 'Nos', unitPrice: Number(item.motorFinal), gstPercent: 18 });
        if (Number(item.remoteFinal) > 0) specializedHardwareItems.push({ description: `${area} - ${type} Remote`, quantity: 1, unit: 'Nos', unitPrice: Number(item.remoteFinal), gstPercent: 18 });
      });
    };

    addHardware(selection.forestCalculation?.items || [], 'Forest');
    addHardware(selection.somfyCalculation?.items || [], 'Somfy');

    // ---------------------------------------------------------
    // 4. BUILD FINAL ITEMS ARRAY
    // ---------------------------------------------------------
    const finalItems: any[] = [];

    // A. Add Fabrics & Sheers
    mainItemsMap.forEach((item) => {
      let desc = item.description;
      if (item.catalogName) desc += ` (${item.catalogName})`;

      finalItems.push({
        description: desc,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        discountPercent: 0,
        gstPercent: item.gstPercent
      });
    });

    // B. Add Aggregated Blackout
    if (totalBlackoutQty > 0) {
      finalItems.push({
        description: 'Blackout Lining',
        quantity: totalBlackoutQty,
        unit: 'Mtr',
        unitPrice: blackoutRate,
        discountPercent: 0,
        gstPercent: 12
      });
    }

    // C. Add Aggregated Hardware (Channel, Labour, Fitting)
    const totalCLF = totalChannelCost + totalLabourCost + totalFittingCost;
    // Count distinct "Windows/Items" for quantity logic (optional visual improvement)
    // We use the number of deep calculation items as a proxy for "number of windows"
    const windowCount = deepCalcItems.length > 0 ? deepCalcItems.length : 1;

    if (totalCLF > 0) {
      finalItems.push({
        description: 'All Curtain Channel, Labour and Fitting Charges',
        quantity: windowCount,
        unit: 'Nos',
        unitPrice: totalCLF / windowCount,
        discountPercent: 0,
        gstPercent: 18
      });
    }

    // D. Add Specialized Hardware
    finalItems.push(...specializedHardwareItems);

    // ---------------------------------------------------------
    // 5. SAVE TO DB
    // ---------------------------------------------------------
    const newQuote = await prisma.quotation.create({
      data: {
        quotation_number: quoteNumber,
        quotationType: quotationType || 'simple',
        selectionId,
        clientName: selection.inquiry?.client_name || 'Client',
        clientAddress: selection.inquiry?.address || '',
        subTotal: 0, discountTotal: 0, taxableValue: 0, gstTotal: 0, grandTotal: 0,
        status: 'draft',
        created_by_id: req.user.id,
        items: {
          create: finalItems.map((item, idx) => {
            const qty = Number(item.quantity);
            const rate = Number(item.unitPrice);
            const subtotal = qty * rate;
            const gstAmt = (subtotal * (item.gstPercent || 0)) / 100;

            return {
              srNo: idx + 1,
              description: item.description,
              quantity: qty,
              unit: item.unit,
              unitPrice: rate,
              gstPercent: item.gstPercent || 0,
              gstAmount: gstAmt,
              subtotal: subtotal,
              taxableValue: subtotal,
              total: subtotal + gstAmt,
              discountPercent: 0, discountAmount: 0
            };
          })
        }
      },
      include: { items: true }
    });

    // Update Final Totals
    const subTotal = newQuote.items.reduce((a, b) => a + Number(b.subtotal), 0);
    const gstTotal = newQuote.items.reduce((a, b) => a + Number(b.gstAmount), 0);
    const grandTotal = subTotal + gstTotal;

    await prisma.quotation.update({
      where: { id: newQuote.id },
      data: { subTotal, taxableValue: subTotal, gstTotal, grandTotal }
    });

    if (selection.inquiryId) {
      await prisma.inquiry.update({
        where: { id: selection.inquiryId },
        data: { stage: 'Quotation Submitted' }
      });

      // Log the stage change
      await logActivity(req.user.id, 'UPDATE', 'INQUIRY_STAGE', selection.inquiryId, `Auto-moved to Quotation Submitted`);
    }

    console.log(`✅ Quotation ${quoteNumber} generated.`);
    res.json({ ...newQuote, subTotal, gstTotal, grandTotal });
    await logActivity(req.user.id, 'CREATE', 'QUOTATION', newQuote.id, `Generated Quotation #${quoteNumber} automatically`);

  } catch (error: any) {
    console.error('❌ Quotation Generation Error:', error);
    res.status(500).json({ error: 'Failed to generate quotation', details: error.message });
  }
});



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
        },
        // === NEW FIELDS ===
        comments: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' }
        },
        checklists: {
          include: { items: { orderBy: { id: 'asc' } } }
        },
        labels: true,
        created_by: { select: { id: true, name: true } }
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
app.put('/api/quotations/:id', authenticateToken, async (req: any, res: Response) => {
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

    // ✅ FIX: Added 'updated?.' and '||' fallback to satisfy TypeScript
    await logActivity(
      req.user.id,
      'UPDATE',
      'QUOTATION',
      id,
      `Updated Quotation #${updated?.quotation_number || 'Unknown'}`
    );

    res.json(updated);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update quotation' });
  }
});

// 5. DELETE QUOTATION
app.delete('/api/quotations/:id', authenticateToken, async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    // Prisma cascade delete will automatically remove QuotationItems if configured in schema.
    // If not, we explicitly delete items first:
    await prisma.quotationItem.deleteMany({ where: { quotationId: id } });

    await prisma.quotation.delete({
      where: { id }
    });

    await logActivity(req.user.id, 'DELETE', 'QUOTATION', id, `Deleted Quotation #${id}`);

    res.json({ message: 'Quotation deleted successfully' });
  } catch (error) {
    console.error('❌ Delete Quotation Error:', error);
    res.status(500).json({ error: 'Failed to delete quotation' });
  }
});

// ==========================================
// ARCHITECT ROUTES (NEW)
// ==========================================

app.get('/api/architects', authenticateToken, async (req: Request, res: Response) => {
  try {
    const architects = await prisma.architect.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(architects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch architects' });
  }
});

app.post('/api/architects', authenticateToken, async (req: any, res: Response) => {
  const { name, address, contact, email, birth_date, anniversary_date, associate_arch_name } = req.body;
  try {
    const newArch = await prisma.architect.create({
      data: {
        name,
        address,
        contact,
        email,
        associate_arch_name,
        birth_date: birth_date ? new Date(birth_date) : null,
        anniversary_date: anniversary_date ? new Date(anniversary_date) : null,
      }
    });
    await logActivity(req.user.id, 'CREATE', 'ARCHITECT', newArch.id, `Created Architect: ${name}`);
    res.json(newArch);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create architect' });
  }
});

app.put('/api/architects/:id', authenticateToken, async (req: any, res: Response) => {
  const { id } = req.params;
  const { name, address, contact, email, birth_date, anniversary_date, associate_arch_name } = req.body;
  try {
    const updated = await prisma.architect.update({
      where: { id },
      data: {
        name,
        address,
        contact,
        email,
        associate_arch_name,
        birth_date: birth_date ? new Date(birth_date) : null,
        anniversary_date: anniversary_date ? new Date(anniversary_date) : null,
      }
    });
    await logActivity(req.user.id, 'UPDATE', 'ARCHITECT', id, `Updated Architect: ${name}`);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update architect' });
  }
});

app.delete('/api/architects/:id', authenticateToken, async (req: any, res: Response) => {
  try {
    await prisma.architect.delete({ where: { id: req.params.id } });
    await logActivity(req.user.id, 'DELETE', 'ARCHITECT', req.params.id, 'Deleted Architect');
    res.json({ message: 'Architect deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete architect' });
  }
});


// ==========================================
// 🆕 NEW PIPELINE & KANBAN ROUTES
// ==========================================

// UPDATE: GET PIPELINE BOARD DATA
app.get('/api/pipeline', authenticateToken, async (req: any, res: Response) => {
  try {
    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin_hr';

    const whereClause = isAdmin ? {} : {
      OR: [
        { sales_person_id: req.user.id },
        { sales_persons: { some: { id: req.user.id } } },
        { comments: { some: { mentions: { some: { userId: req.user.id } } } } } // Allow if mentioned
      ]
    };

    const inquiries = await prisma.inquiry.findMany({
      where: whereClause,
      include: {
        sales_person: { select: { id: true, name: true } },
        sales_persons: { select: { id: true, name: true } },

        // ✅ RESTORED THESE LINES! This is what makes the UI remember on refresh!
        labels: true,
        checklists: { include: { items: true } },
        payments: true,
        selections: { select: { id: true, selection_number: true, status: true, quotations: true } },

        comments: {
          include: {
            user: { select: { name: true } },
            mentions: {
              include: { user: { select: { id: true, name: true } } }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        // Latest report entry — used to detect neglected/forgotten leads
        reportEntries: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } }
      },
      orderBy: { orderIndex: 'asc' }
    });

    // Stages that should never be flagged as "forgotten" (done / parked on purpose)
    const inactiveExcludedStages = new Set(['Completed', 'Future Reference', 'Completed Reference']);
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const twoDaysMs = 2 * dayMs;

    // Compute inactivity flag from FULL data (before per-user comment filtering)
    const withActivity = inquiries.map((inq: any) => {
      const lastCommentMs = inq.comments.length ? new Date(inq.comments[0].createdAt).getTime() : 0;
      const lastReportMs = inq.reportEntries?.length ? new Date(inq.reportEntries[0].createdAt).getTime() : 0;
      const createdMs = new Date(inq.created_at).getTime();
      const lastActivityMs = Math.max(lastCommentMs, lastReportMs) || createdMs;
      const isInactive =
        !inactiveExcludedStages.has(inq.stage) &&
        createdMs < nowMs - twoDaysMs &&
        lastActivityMs < nowMs - twoDaysMs;
      const daysInactive = isInactive ? Math.floor((nowMs - lastActivityMs) / dayMs) : 0;
      return { ...inq, isInactive, daysInactive };
    });

    // ✅ MODIFIED: Filter data before sending to the frontend
    const filteredInquiries = withActivity.map((inq: any) => {
      const isAssigned = isAdmin || inq.sales_person_id === req.user.id || inq.sales_persons.some((u: any) => u.id === req.user.id);

      if (isAssigned) {
        return inq; // Assigned users see everything
      } else {
        // Not assigned (only here because they were @mentioned) -> Strip out all other comments
        return {
          ...inq,
          comments: inq.comments.filter((c: any) =>
            c.mentions.some((m: any) => m.userId === req.user.id) || c.userId === req.user.id
          ),
          checklists: [],
        };
      }
    });

    res.json(filteredInquiries);
  } catch (error) {
    console.error('Pipeline Error:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline' });
  }
});

// 2. MOVE CARD (Update Stage and Position)
// PUT /api/inquiries/:id/stage
// Handles stage change + optional stageDueDate
app.put('/api/inquiries/:id/stage', authenticateToken, async (req: any, res: Response) => {
  try {
    const { stage, orderIndex, stageDueDate } = req.body;

    const updated = await prisma.inquiry.update({
      where: { id: req.params.id },
      data: {
        stage,
        ...(orderIndex !== undefined && { orderIndex }),
        // Save stageDueDate if provided, clear it if not sent
        stageDueDate: stageDueDate ? new Date(stageDueDate) : null,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update stage' });
  }
});
// ==========================================
// 3. ADD COMMENT TO INQUIRY
// ==========================================
app.post('/api/inquiries/:id/comments', authenticateToken, async (req: any, res: Response) => {
  const { id } = req.params;
  // ✅ FIX: Extract attachmentUrls correctly
  const { content, attachmentUrl, attachmentUrls, dueDate, mentionedUserIds, stage } = req.body;

  try {
    const comment = await prisma.inquiryComment.create({
      data: {
        content: content || '',
        attachmentUrl: attachmentUrl || null,
        // ✅ FIX: Save the array of images
        attachmentUrls: attachmentUrls && attachmentUrls.length > 0 ? attachmentUrls : (attachmentUrl ? [attachmentUrl] : []),
        dueDate: dueDate ? new Date(dueDate) : null,
        stage: stage || null,
        inquiryId: id,
        userId: req.user.id,
        ...(mentionedUserIds && Array.isArray(mentionedUserIds) && mentionedUserIds.length > 0 && {
          mentions: {
            create: mentionedUserIds.map((uid: string) => ({ userId: uid }))
          }
        })
      },
      include: {
        user: { select: { name: true } },
        mentions: {
          include: { user: { select: { id: true, name: true } } }
        }
      }
    });
    await logActivity(req.user.id, 'CREATE', 'COMMENT', comment.id, `Added a comment to Inquiry`);
    res.json(comment);
  } catch (error) {
    console.error('Comment create error:', error);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// ==========================================
// EDIT COMMENT (✅ RESTORED to fix 404 Error)
// ==========================================
app.put('/api/comments/:id', authenticateToken, async (req: any, res: Response) => {
  // ✅ FIX: Extract all fields (including mentions so editing can re-tag people)
  const { content, dueDate, attachmentUrl, attachmentUrls, mentionedUserIds } = req.body;

  try {
    // If the client sent a mentions list, replace the comment's mentions with it.
    // This grants visibility to ALL newly-tagged users and removes any that were untagged.
    if (mentionedUserIds && Array.isArray(mentionedUserIds)) {
      await prisma.inquiryCommentMention.deleteMany({ where: { commentId: req.params.id } });
    }

    const comment = await prisma.inquiryComment.update({
      where: { id: req.params.id },
      data: {
        content: content || '',
        dueDate: dueDate ? new Date(dueDate) : null,
        attachmentUrl: attachmentUrl || null,
        // ✅ FIX: Save the array of images
        attachmentUrls: attachmentUrls && attachmentUrls.length > 0 ? attachmentUrls : (attachmentUrl ? [attachmentUrl] : []),
        ...(mentionedUserIds && Array.isArray(mentionedUserIds) && mentionedUserIds.length > 0 && {
          mentions: {
            create: mentionedUserIds.map((uid: string) => ({ userId: uid }))
          }
        })
      },
      include: {
        user: { select: { name: true } },
        mentions: {
          include: { user: { select: { id: true, name: true } } }
        }
      }
    });

    await logActivity(req.user.id, 'UPDATE', 'COMMENT', comment.id, `Edited a comment`);
    res.json(comment);
  } catch (error) {
    console.error('Comment edit error:', error);
    res.status(500).json({ error: 'Failed to edit comment' });
  }
});

// ==========================================
// DELETE COMMENT
// ==========================================
app.delete('/api/comments/:id', authenticateToken, async (req: any, res: Response) => {
  try {
    // Mentions are removed automatically via onDelete: Cascade on the relation.
    await prisma.inquiryComment.delete({ where: { id: req.params.id } });
    await logActivity(req.user.id, 'DELETE', 'COMMENT', req.params.id, `Deleted a comment`);
    res.json({ success: true });
  } catch (error) {
    console.error('Comment delete error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});



// Mark mentions as read for a specific inquiry card
app.put('/api/inquiries/:id/mentions/read', authenticateToken, async (req: any, res: Response) => {
  try {
    const { stage } = req.body;

    // Build where clause to only clear mentions for this specific stage, or all if no stage provided
    const whereClause: any = {
      userId: req.user.id,
      isRead: false,
      comment: { inquiryId: req.params.id }
    };

    if (stage) {
      whereClause.comment.stage = stage;
    }

    await (prisma as any).inquiryCommentMention.updateMany({
      where: whereClause,
      data: { isRead: true }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark mentions as read' });
  }
});

// 4. CREATE CHECKLIST
app.post('/api/inquiries/:id/checklists', authenticateToken, async (req: any, res: Response) => {
  try {
    const list = await prisma.inquiryChecklist.create({
      data: {
        title: req.body.title,
        inquiryId: req.params.id
      },
      include: { items: true }
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create checklist' });
  }
});


app.delete('/api/checklists/:id', authenticateToken, async (req: any, res: Response) => {
  try {
    // Items cascade delete usually, but we can delete explicitly to be safe if schema doesn't cascade
    await prisma.inquiryChecklistItem.deleteMany({ where: { checklistId: req.params.id } });

    await prisma.inquiryChecklist.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete checklist' });
  }
});

// 6.5 DELETE INDIVIDUAL CHECKLIST ITEM
app.delete('/api/checklist-items/:id', authenticateToken, async (req: any, res: Response) => {
  try {
    await prisma.inquiryChecklistItem.delete({
      where: { id: req.params.id }
    });
    
    await logActivity(req.user.id, 'DELETE', 'CHECKLIST_ITEM', req.params.id, 'Deleted a checklist item');
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting checklist item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});
// 5. ADD ITEM TO CHECKLIST
app.post('/api/checklists/:id/items', authenticateToken, async (req: any, res: Response) => {
  try {
    const item = await prisma.inquiryChecklistItem.create({
      data: {
        text: req.body.text,
        checklistId: req.params.id,
        isCompleted: false
      }
    });
    await logActivity(req.user.id, 'CREATE', 'CHECKLIST_ITEM', item.id, `Added item to checklist: ${req.body.text}`);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add item' });
  }
});


// ==========================================
// GLOBAL LABEL MANAGEMENT
// ==========================================

// 1. EDIT LABEL GLOBALLY (Updates all cards with this label)
app.put('/api/labels/update-global', authenticateToken, async (req: any, res: Response) => {
  const { oldText, oldColor, newText, newColor } = req.body;
  try {
    await prisma.inquiryLabel.updateMany({
      where: { text: oldText, color: oldColor },
      data: { text: newText, color: newColor }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update label globally' });
  }
});

// 2. DELETE LABEL GLOBALLY (Removes from all cards)
app.post('/api/labels/delete-global', authenticateToken, async (req: any, res: Response) => {
  const { text, color } = req.body;
  try {
    await prisma.inquiryLabel.deleteMany({
      where: { text, color }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete label globally' });
  }
});

// 6. TOGGLE CHECKLIST ITEM
app.put('/api/checklist-items/:id', authenticateToken, async (req: any, res: Response) => {
  try {
    const item = await prisma.inquiryChecklistItem.update({
      where: { id: req.params.id },
      data: { isCompleted: req.body.isCompleted }
    });
    await logActivity(req.user.id, 'UPDATE', 'CHECKLIST_ITEM', req.params.id, `Toggled checklist item status to ${req.body.isCompleted ? 'Complete' : 'Incomplete'}`);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// 7. ADD COLORED LABEL
app.post('/api/inquiries/:id/labels', authenticateToken, async (req: any, res: Response) => {
  try {
    const label = await prisma.inquiryLabel.create({
      data: {
        text: req.body.text,
        color: req.body.color,
        inquiryId: req.params.id
      }
    });
    await logActivity(req.user.id, 'CREATE', 'LABEL', label.id, `Added label [${req.body.text}] to Inquiry`);
    res.json(label);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add label' });
  }
});


// ==========================================
// PAYMENT TRACKING ROUTES
// ==========================================

// 1. Add a Payment to an Inquiry
app.post('/api/inquiries/:id/payments', authenticateToken, async (req: any, res: Response) => {
  const { id } = req.params;
  const { amount, date } = req.body;

  try {
    const payment = await prisma.inquiryPayment.create({
      data: {
        inquiryId: id,
        amount: parseFloat(amount),
        date: new Date(date),
        userId: req.user.id
      },
      include: { user: { select: { name: true } } }
    });

    await logActivity(req.user.id, 'CREATE', 'PAYMENT', payment.id, `Added payment follow-up of ₹${amount}`);
    res.json(payment);
  } catch (error) {
    console.error('Payment create error:', error);
    res.status(500).json({ error: 'Failed to add payment' });
  }
});

// Update an existing payment amount and date
// Update an existing payment amount and date
app.put('/api/payments/:id', authenticateToken, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, date } = req.body;

    if (!amount || !date) {
      return res.status(400).json({ error: "Amount and date are required" });
    }

    const updatedPayment = await prisma.inquiryPayment.update({
      where: { 
        id: id 
      },
      data: {
        amount: Number(amount),
        date: new Date(date),
      },
    });

    await logActivity(req.user.id, 'UPDATE', 'PAYMENT', id, `Updated payment amount to ₹${amount}`);
    res.json(updatedPayment);
  } catch (error) {
    console.error("Error updating payment:", error);
    res.status(500).json({ error: "Failed to update payment" });
  }
});

// 2. Mark Payment as Collected
app.put('/api/payments/:id/collect', authenticateToken, async (req: any, res: Response) => {
  try {
    const payment = await prisma.inquiryPayment.update({
      where: { id: req.params.id },
      data: { status: 'collected' }
    });
    await logActivity(req.user.id, 'UPDATE', 'PAYMENT', payment.id, `Marked payment as collected`);
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});

// 3. Fetch Pending Payments for To-Do/Reports
app.get('/api/payments/pending', authenticateToken, async (req: any, res: Response) => {
  try {
    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin_hr';
    const whereClause: any = {}; // Empty object means fetch ALL statuses
    // If not admin, only show payments for inquiries they own or collaborate on
    if (!isAdmin) {
      whereClause.inquiry = {
        OR: [
          { sales_person_id: req.user.id },
          { sales_persons: { some: { id: req.user.id } } }
        ]
      };
    }

    const payments = await prisma.inquiryPayment.findMany({
      where: whereClause,
      include: {
        inquiry: { select: { inquiry_number: true, client_name: true, stage: true } },
        user: { select: { name: true } }
      },
      orderBy: { date: 'asc' }
    });

    res.json(payments);
  } catch (error) {
    console.error('Pending payments error:', error);
    res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
});


// ==========================================
// 🆕 QUOTATION PIPELINE & KANBAN ROUTES
// ==========================================

// 1. GET PIPELINE BOARD DATA
app.get('/api/quotations/pipeline/board', authenticateToken, async (req: any, res: Response) => {
  try {
    const quotes = await prisma.quotation.findMany({
      include: {
        selection: {
          include: {
            inquiry: { include: { sales_person: { select: { id: true, name: true } } } }
          }
        },
        created_by: { select: { id: true, name: true } },
        comments: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' }
        },
        checklists: {
          include: { items: { orderBy: { id: 'asc' } } }
        },
        labels: true,
        items: { select: { id: true } } // Optimization: only fetch IDs
      },
      orderBy: { updated_at: 'desc' }
    });

    res.json(quotes);
  } catch (error) {
    console.error('Quote Pipeline Error:', error);
    res.status(500).json({ error: 'Failed to fetch quotation pipeline' });
  }
});

// 2. MOVE CARD (Update Stage)
app.put('/api/quotations/:id/stage', authenticateToken, async (req: any, res: Response) => {
  const { id } = req.params;
  const { stage } = req.body;

  try {
    const updated = await prisma.quotation.update({
      where: { id },
      data: { stage }
    });

    // Log the movement
    await logActivity(req.user.id, 'UPDATE', 'QUOTATION_STAGE', id, `Moved Quotation to ${stage}`);

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to move card' });
  }
});

// 3. ADD COMMENT TO QUOTATION
app.post('/api/quotations/:id/comments', authenticateToken, async (req: any, res: Response) => {
  try {
    const comment = await prisma.quotationComment.create({
      data: {
        content: req.body.content || '',
        attachmentUrl: req.body.attachmentUrl || null,
        quotationId: req.params.id,
        userId: req.user.id
      },
      include: { user: { select: { name: true } } }
    });
    await logActivity(req.user.id, 'CREATE', 'COMMENT', comment.id, `Added a comment to Quotation`);
    res.json(comment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// 4. MANAGE LABELS
app.post('/api/quotations/:id/labels', authenticateToken, async (req: any, res: Response) => {
  try {
    const label = await prisma.quotationLabel.create({
      data: {
        text: req.body.text,
        color: req.body.color,
        quotationId: req.params.id
      }
    });
    res.json(label);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add label' });
  }
});

app.delete('/api/quotation-labels/:id', authenticateToken, async (req: any, res: Response) => {
  try {
    await prisma.quotationLabel.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove label' });
  }
});

// 5. MANAGE CHECKLISTS
app.post('/api/quotations/:id/checklists', authenticateToken, async (req: any, res: Response) => {
  try {
    const list = await prisma.quotationChecklist.create({
      data: {
        title: req.body.title,
        quotationId: req.params.id
      },
      include: { items: true }
    });
    await logActivity(req.user.id, 'CREATE', 'CHECKLIST', list.id, `Created checklist: ${req.body.title}`);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create checklist' });
  }
});

app.delete('/api/quotation-checklists/:id', authenticateToken, async (req: any, res: Response) => {
  try {
    // Explicitly delete items first to ensure cleanliness
    await prisma.quotationChecklistItem.deleteMany({ where: { checklistId: req.params.id } });

    await prisma.quotationChecklist.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete checklist' });
  }
});

// 6. MANAGE CHECKLIST ITEMS
app.post('/api/quotation-checklists/:id/items', authenticateToken, async (req: any, res: Response) => {
  try {
    const item = await prisma.quotationChecklistItem.create({
      data: {
        text: req.body.text,
        checklistId: req.params.id,
        isCompleted: false
      }
    });

    await logActivity(req.user.id, 'CREATE', 'CHECKLIST_ITEM', item.id, `Added quotation checklist item: ${req.body.text}`);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add item' });
  }
});

app.put('/api/quotation-checklist-items/:id', authenticateToken, async (req: any, res: Response) => {
  try {
    const item = await prisma.quotationChecklistItem.update({
      where: { id: req.params.id },
      data: { isCompleted: req.body.isCompleted }
    });
    await logActivity(req.user.id, 'UPDATE', 'CHECKLIST_ITEM', req.params.id, `Toggled quotation checklist item to ${req.body.isCompleted ? 'Complete' : 'Incomplete'}`);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// ==========================================
// NEW ROUTES (Add these at the end of your file)
// ==========================================

// UPLOAD IMAGE FOR COMMENT
app.post('/api/upload', authenticateToken, uploadDocs.single('file'), (req: any, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // Return the URL that the frontend can use to display the image
  res.json({ url: `/documents/${req.file.filename}` });
});

// UPDATE INQUIRY DESCRIPTION
app.put('/api/inquiries/:id/description', authenticateToken, async (req: any, res: Response) => {
  try {
    const updated = await prisma.inquiry.update({
      where: { id: req.params.id },
      data: { description: req.body.description }
    });
    await logActivity(req.user.id, 'UPDATE', 'INQUIRY', req.params.id, `Updated inquiry description`);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update description' });
  }
});

// ASSIGN MEMBER (Re-assign Sales Person)
// ASSIGN MEMBER (Handle Single Owner OR Multiple Members)
app.put('/api/inquiries/:id/assign', authenticateToken, async (req: any, res: Response) => {
  try {
    const { userIds, userId } = req.body;

    // SCENARIO 1: Frontend sends a list of members (Collaborators)
    if (userIds && Array.isArray(userIds)) {
      if (userIds.length === 0) {
        return res.status(400).json({ error: "At least one member must be assigned." });
      }

      const primaryOwnerId = userIds[0];
      const collaborators = userIds.slice(1);

      const updated = await prisma.inquiry.update({
        where: { id: req.params.id },
        data: {
          sales_person_id: primaryOwnerId,
          sales_persons: {
            set: collaborators.map((uid: string) => ({ id: uid }))
          }
        },
        include: {
          sales_person: { select: { id: true, name: true } },
          sales_persons: { select: { id: true, name: true } }
        }
      });
      const assignedNames = [updated.sales_person.name, ...updated.sales_persons.map((u: any) => u.name)].join(', ');
      await logActivity(req.user.id, 'UPDATE', 'INQUIRY_MEMBERS', req.params.id, `Assigned members [${assignedNames}] to inquiry`);
      return res.json(updated);
    }

    // SCENARIO 2: Frontend sends a single user (Owner change)
    if (userId) {
      const updated = await prisma.inquiry.update({
        where: { id: req.params.id },
        data: { sales_person_id: userId }
      });
      const newOwner = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      await logActivity(req.user.id, 'UPDATE', 'INQUIRY_OWNER', req.params.id, `Transferred inquiry ownership to ${newOwner?.name || userId}`);
      return res.json(updated);
    }

    res.status(400).json({ error: "Invalid assignment data" });

  } catch (error) {
    console.error("Assign Error:", error);
    res.status(500).json({ error: 'Failed to assign member' });
  }
});

// DELETE LABEL
app.delete('/api/labels/:id', authenticateToken, async (req: any, res: Response) => {
  try {
    await prisma.inquiryLabel.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove label' });
  }
});

// GET ALL USERS (For Member Picker)
app.get('/api/users/all', authenticateToken, async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, role: true, email: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ==========================================
// HELPER: Get report window boundaries
// Report day = 6AM today → midnight (12AM next day)
// Employees can submit their report any time from 6 AM up to midnight.
// The 12 AM–5:59 AM gap counts as the PREVIOUS day's window.
// ==========================================

const getReportWindow = (dateInput?: string) => {
  const base = dateInput ? new Date(dateInput) : new Date();

  if (!dateInput) {
    // Before 6 AM → still in yesterday's report window
    if (base.getHours() < 6) {
      base.setDate(base.getDate() - 1);
    }
    // 6 AM to midnight → today's window (no shift needed)
  }

  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();

  // reportDate stored as 6 PM of the calendar day (backward-compatible with existing DB records)
  const reportDate = new Date(year, month, day, 18, 0, 0, 0);
  // Window: 6 AM of the day → midnight (start of next day)
  const windowStart = new Date(year, month, day, 6, 0, 0, 0);
  const windowEnd = new Date(year, month, day + 1, 0, 0, 0, 0); // midnight

  return { windowStart, windowEnd, reportDate };
};

// ==========================================
// POST /api/daily-reports/other-work
// Employee submits hour-by-hour work blocks
// ==========================================
app.post('/api/daily-reports/other-work', authenticateToken, async (req: any, res: Response) => {
  try {
    // Extract date from the body
    const { entries, date } = req.body;

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Please add at least one time block.' });
    }

    for (const e of entries) {
      if (!e.startHour || !e.endHour || !e.description?.trim()) {
        return res.status(400).json({ error: 'Each block needs start time, end time, and description.' });
      }
      if (e.startHour >= e.endHour) {
        return res.status(400).json({ error: `End time must be after start time (${e.startHour} – ${e.endHour}).` });
      }
    }

    // Pass the selected date to get the correct window
    const { reportDate } = getReportWindow(date);

    const report = await (prisma as any).dailyReport.upsert({
      where: { userId_reportDate: { userId: req.user.id, reportDate } },
      update: { status: 'SUBMITTED', submittedAt: new Date(), updatedAt: new Date() },
      create: { userId: req.user.id, reportDate, status: 'SUBMITTED' },
    });

    await (prisma as any).otherWorkEntry.deleteMany({ where: { dailyReportId: report.id } });

    await (prisma as any).otherWorkEntry.createMany({
      data: entries.map((e: any) => ({
        dailyReportId: report.id,
        startHour: e.startHour,
        endHour: e.endHour,
        description: e.description.trim(),
      })),
    });

    res.json({ success: true, reportId: report.id });
  } catch (error) {
    console.error('other-work submit error:', error);
    res.status(500).json({ error: 'Failed to submit work log' });
  }
});



// ==========================================
// GET /api/daily-reports/my-today
// Employee: today's existing work entries
// ==========================================
// 1. UPDATE: GET /api/daily-reports/my-today
app.get('/api/daily-reports/my-today', authenticateToken, async (req: any, res: Response) => {
  try {
    // Look for a date in the query string (e.g., ?date=2026-04-23)
    const { date } = req.query;
    const { reportDate } = getReportWindow(date);

    const existingReport = await (prisma as any).dailyReport.findUnique({
      where: { userId_reportDate: { userId: req.user.id, reportDate } },
      include: { otherWorkEntries: { orderBy: { startHour: 'asc' } } },
    });

    res.json({ existingReport: existingReport || null, reportDate });
  } catch (error) {
    console.error('my-today error:', error);
    res.status(500).json({ error: 'Failed to fetch report for date' });
  }
});
// ==========================================
// GET /api/daily-reports/my-history
// Employee: all past reports
// ==========================================
app.get('/api/daily-reports/my-history', authenticateToken, async (req: any, res: Response) => {
  try {
    const reports = await (prisma as any).dailyReport.findMany({
      where: { userId: req.user.id },
      include: { otherWorkEntries: { orderBy: { startHour: 'asc' } } },
      orderBy: { reportDate: 'desc' },
    });
    res.json(reports);
  } catch (error) {
    console.error('my-history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});
// ==========================================
// GET /api/daily-reports/admin
// Admin: all reports filterable by date/user
// ==========================================
app.get('/api/daily-reports/admin', authenticateToken, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin_hr') {
      return res.status(403).json({ error: 'Access Denied' });
    }

    const { date, userId } = req.query as any;

    const where: any = {};
    if (userId) where.userId = userId;
    if (date) {
      const { reportDate } = getReportWindow(date);
      where.reportDate = reportDate;
    }

    const reports = await (prisma as any).dailyReport.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, role: true } },
        otherWorkEntries: { orderBy: { startHour: 'asc' } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    let missingUsers: any[] = [];
    if (date) {
      const allUsers = await prisma.user.findMany({
        where: { role: { in: ['sales', 'sales_manager', 'accounting', 'admin_hr'] } },
        select: { id: true, name: true, role: true },
      });
      const targeted = userId ? allUsers.filter((u: any) => u.id === userId) : allUsers;
      const submittedSet = new Set(reports.map((r: any) => r.userId));
      missingUsers = targeted.filter((u: any) => !submittedSet.has(u.id));
    }

    res.json({ reports, missingUsers });
  } catch (error) {
    console.error('admin reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// ==========================================
// GET /api/daily-reports/inquiry/:inquiryId/timeline
// Inquiry detail page timeline
// ==========================================
app.get('/api/daily-reports/inquiry/:inquiryId/timeline', authenticateToken, async (req: any, res: Response) => {
  try {
    const entries = await (prisma as any).dailyReportEntry.findMany({
      where: { inquiryId: req.params.inquiryId },
      include: {
        dailyReport: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const inquiry = await prisma.inquiry.findUnique({
      where: { id: req.params.inquiryId },
      select: {
        id: true, inquiry_number: true, client_name: true, stage: true,
        sales_person: { select: { id: true, name: true } },
      },
    });

    res.json({ inquiry, timeline: entries });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

app.get('/api/notifications', authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const now = new Date();

    // Report window: 6 AM → midnight of same day
    // reportDate is stored as 6 PM of the current calendar day (backward-compatible)
    const todayAt6PM = new Date(now);
    todayAt6PM.setHours(18, 0, 0, 0);

    // Deadline for submission = midnight (end of the day)
    const todayAtMidnight = new Date(now);
    todayAtMidnight.setDate(todayAtMidnight.getDate() + 1);
    todayAtMidnight.setHours(0, 0, 0, 0);

    // If it's before 6 AM, we're still in yesterday's report window
    const reportDate = (now.getHours() < 6)
      ? (() => { const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(18, 0, 0, 0); return d; })()
      : todayAt6PM; // canonical report date for today

    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const notifications: any[] = [];

    // ── 1. Mentions (@me) ──
    const newMentions = await (prisma as any).inquiryCommentMention.findMany({
      where: { userId, isRead: false },
      include: {
        comment: {
          include: {
            user: { select: { name: true } },
            inquiry: { select: { client_name: true } }
          }
        }
      },
      orderBy: { comment: { createdAt: 'desc' } },
      take: 5
    });

    if (newMentions.length > 0) {
      const names = [...new Set(newMentions.map((m: any) => m.comment.user.name))];
      notifications.push({
        id: 'new-mentions',
        type: 'mention',
        title: `New Mentions (${newMentions.length})`,
        message: `${names.slice(0, 2).join(', ')}${names.length > 2 ? ' and others' : ''} tagged you in pipeline comments.`,
        link: '/daily-report?tab=todo',
        severity: 'info',
        createdAt: newMentions[0].comment.createdAt,
      });
    }

    // ── 2. Tasks Due Today & Overdue ──
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const taskCount = await (prisma as any).inquiryComment.count({
      where: {
        dueDate: { gte: today, lte: todayEnd },
        OR: [{ userId }, { mentions: { some: { userId } } }]
      }
    });

    const stageCount = await prisma.inquiry.count({
      where: {
        stageDueDate: { gte: today, lte: todayEnd },
        OR: [
          { sales_person_id: userId },
          { sales_persons: { some: { id: userId } } }
        ]
      }
    });

    const totalDueToday = taskCount + stageCount;
    if (totalDueToday > 0) {
      notifications.push({
        id: 'tasks-due-today',
        type: 'todo_due',
        title: `🔥 ${totalDueToday} Task${totalDueToday > 1 ? 's' : ''} Due Today`,
        message: `You have pipeline follow-ups or tasks due today. Don't forget!`,
        link: '/daily-report?tab=todo',
        severity: 'warning',
        createdAt: now.toISOString(),
      });
    }

    const overdueTaskCount = await (prisma as any).inquiryComment.count({
      where: {
        dueDate: { lt: today },
        OR: [{ userId }, { mentions: { some: { userId } } }]
      }
    });

    const overdueStageCount = await prisma.inquiry.count({
      where: {
        stageDueDate: { lt: today },
        OR: [
          { sales_person_id: userId },
          { sales_persons: { some: { id: userId } } }
        ]
      }
    });

    const totalOverdue = overdueTaskCount + overdueStageCount;
    if (totalOverdue > 0) {
      notifications.push({
        id: 'tasks-overdue',
        type: 'todo_overdue',
        title: `⚠️ ${totalOverdue} Task${totalOverdue > 1 ? 's' : ''} Overdue`,
        message: `You have overdue pipeline follow-ups! Please review them.`,
        link: '/daily-report?tab=todo',
        severity: 'error',
        createdAt: now.toISOString(),
      });
    }

    // ── 3. Work Log Reminder (All except Super Admin) ──
    // Remind employees from 6 AM right up to midnight to submit their daily report
    const withinReportWindow = now >= (() => { const d = new Date(now); d.setHours(6, 0, 0, 0); return d; })() && now < todayAtMidnight;
    if (role !== 'super_admin' && withinReportWindow) {
      const myReport = await (prisma as any).dailyReport.findUnique({
        where: { userId_reportDate: { userId, reportDate } },
      });
      if (!myReport) {
        const msLeft = todayAtMidnight.getTime() - now.getTime();
        const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
        const minsLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
        const urgency = hoursLeft < 2 ? '🚨' : '📝';
        notifications.push({
          id: 'own-report-missing',
          type: 'missing_report',
          title: `${urgency} Daily Report Pending`,
          message: `Please fill in today's work log before midnight. ${hoursLeft}h ${minsLeft}m remaining.`,
          link: '/daily-report',
          severity: hoursLeft < 2 ? 'error' : 'warning',
          createdAt: now.toISOString(),
        });
      }
    }

    // ── 3b. Forgotten Leads (per employee) ──
    // Remind sales staff about THEIR OWN inquiries that have had no activity
    // (no daily-report entry AND no pipeline comment) for 2+ days, so leads
    // don't get neglected. Brand-new and completed inquiries are excluded.
    if (role === 'sales' || role === 'sales_manager') {
      const inactiveLeadWhere: any = {
        stage: { notIn: ['Completed', 'Future Reference', 'Completed Reference'] },
        created_at: { lt: twoDaysAgo }, // skip brand-new leads
        OR: [
          { sales_person_id: userId },
          { sales_persons: { some: { id: userId } } },
        ],
        AND: [
          { reportEntries: { none: { createdAt: { gte: twoDaysAgo } } } },
          { comments: { none: { createdAt: { gte: twoDaysAgo } } } },
        ],
      };

      const myInactiveCount = await prisma.inquiry.count({ where: inactiveLeadWhere });
      if (myInactiveCount > 0) {
        const sample = await prisma.inquiry.findMany({
          where: inactiveLeadWhere,
          select: { inquiry_number: true },
          orderBy: { updated_at: 'asc' },
          take: 3,
        });
        notifications.push({
          id: 'my-inactive-leads',
          type: 'inactive_inquiry',
          title: `🚨 ${myInactiveCount} Lead${myInactiveCount > 1 ? 's' : ''} Need Attention`,
          message: `No activity for 2+ days: ${sample.map((i: any) => i.inquiry_number).join(', ')}${myInactiveCount > 3 ? ` +${myInactiveCount - 3} more` : ''}. Please follow up!`,
          link: '/pipeline',
          severity: 'error',
          createdAt: now.toISOString(),
        });
      }
    }

    // ── 4. SUPER ADMIN / ADMIN HR ──────────────────────────────────────────────
    if (role === 'super_admin' || role === 'admin_hr') {

      // Missing daily reports — sales employees who haven't submitted today
      const salesUsers = await prisma.user.findMany({
        where: { role: { in: ['sales', 'sales_manager', 'accounting'] } },
        select: { id: true, name: true },
      });

      const submittedUserIds = await (prisma as any).dailyReport.findMany({
        where: { reportDate },
        select: { userId: true },
      }).then((rows: any[]) => rows.map((r: any) => r.userId));

      const missingCount = salesUsers.filter((u: any) => !submittedUserIds.includes(u.id)).length;
      const missingNames = salesUsers.filter((u: any) => !submittedUserIds.includes(u.id)).map((u: any) => u.name);

      if (missingCount > 0 && now < todayAt6PM) {
        notifications.push({
          id: 'missing-reports-admin',
          type: 'missing_report_admin',
          title: `${missingCount} Teams Reports Missing`,
          message: `${missingNames.slice(0, 3).join(', ')}${missingNames.length > 3 ? ` +${missingNames.length - 3} more` : ''} haven't submitted today.`,
          link: '/daily-reports/admin',
          severity: 'warning',
          createdAt: now.toISOString(),
        });
      }

      // Inactive inquiries (2+ days no update)
      const inactiveInquiries = await prisma.inquiry.findMany({
        where: {
          reportEntries: { none: { createdAt: { gte: twoDaysAgo } } },
        },
        select: { id: true, inquiry_number: true, client_name: true },
        take: 5,
      });

      if (inactiveInquiries.length > 0) {
        notifications.push({
          id: 'inactive-inquiries',
          type: 'inactive_inquiry',
          title: `${inactiveInquiries.length} Inactive Inquiries`,
          message: `No update for 2+ days: ${inactiveInquiries.slice(0, 2).map((i: any) => i.inquiry_number).join(', ')}.`,
          link: '/daily-reports/admin?tab=inactive',
          severity: 'error',
          createdAt: now.toISOString(),
        });
      }

      // Pending leave requests
      const pendingLeaves = await prisma.leaveRequest.count({ where: { status: 'PENDING' } });
      if (pendingLeaves > 0) {
        notifications.push({
          id: 'pending-leaves',
          type: 'leave_request',
          title: `${pendingLeaves} Pending Leaves`,
          message: `${pendingLeaves} leave request${pendingLeaves > 1 ? 's' : ''} awaiting approval.`,
          link: '/attendance',
          severity: 'info',
          createdAt: now.toISOString(),
        });
      }

      // Client birthdays
      const allInquiries = await prisma.inquiry.findMany({
        where: { client_birth_date: { not: null } },
        select: { id: true, client_name: true, client_birth_date: true },
      });
      const birthdaysToday = allInquiries.filter((inq: any) => {
        if (!inq.client_birth_date) return false;
        const bd = new Date(inq.client_birth_date);
        return bd.getDate() === now.getDate() && bd.getMonth() === now.getMonth();
      });
      if (birthdaysToday.length > 0) {
        notifications.push({
          id: 'birthdays-today',
          type: 'birthday',
          title: `🎂 ${birthdaysToday.length} Birthday${birthdaysToday.length > 1 ? 's' : ''} Today`,
          message: birthdaysToday.slice(0, 2).map((i: any) => i.client_name).join(', '),
          link: '/inquiries',
          severity: 'info',
          createdAt: now.toISOString(),
        });
      }
    }

    // Sort: errors first, then warnings, then info
    const severityOrder = { error: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => (severityOrder[a.severity as keyof typeof severityOrder] ?? 3) - (severityOrder[b.severity as keyof typeof severityOrder] ?? 3));

    res.json({ notifications, count: notifications.length });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// New Route: Mark all mentions as read
app.put('/api/notifications/mentions/read-all', authenticateToken, async (req: any, res: Response) => {
  try {
    await (prisma as any).inquiryCommentMention.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update mentions' });
  }
});

// ==========================================
// GET /api/pipeline/todo-items
// Returns inquiry comments with due dates (for To-Do list in reports)
// ==========================================
app.get('/api/pipeline/todo-items', authenticateToken, async (req: any, res: Response) => {
  try {
    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin_hr';
    const userId = req.user.id;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // ── Part 1: Comment-based todo items (existing) ──────────────────────────
    const commentWhere: any = { dueDate: { not: null } };
    if (!isAdmin) {
      commentWhere.OR = [
        { userId: req.user.id },
        { mentions: { some: { userId: req.user.id } } }
      ];
    }

    const comments = await (prisma as any).inquiryComment.findMany({
      where: commentWhere,
      include: {
        user: { select: { id: true, name: true } },
        mentions: { include: { user: { select: { id: true, name: true } } } },
        inquiry: {
          select: { id: true, inquiry_number: true, client_name: true, stage: true, stageDueDate: true }
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    // ── Part 2: Stage-based due dates ────────────────────────────────────────
    const stageWhere: any = { stageDueDate: { not: null } };
    if (!isAdmin) {
      stageWhere.OR = [
        { sales_person_id: userId },
        { sales_persons: { some: { id: userId } } }
      ];
    }

    const stageInquiries = await prisma.inquiry.findMany({
      where: stageWhere,
      include: {
        sales_person: { select: { id: true, name: true } },
        sales_persons: { select: { id: true, name: true } },
      },
      orderBy: { updated_at: 'desc' },
    });

    // Classify helper
    const classify = (dateVal: Date | string, isCompleted: boolean) => {
      if (isCompleted) return 'completed';
      const d = new Date(dateVal);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      if (d < todayStart) return 'overdue';
      if (d <= todayEnd) return 'today';
      return 'upcoming';
    };

    // Shape comment todos
    const commentTodos = comments.map((c: any) => ({
      id: `comment-${c.id}`,
      type: 'comment',
      dueDate: c.dueDate,
      dueDateStatus: classify(c.dueDate, c.isCompleted),
      content: c.content,
      
      // ✅ FIX: Actually send the images to the To-Do list frontend!
      attachmentUrl: c.attachmentUrl,
      attachmentUrls: c.attachmentUrls,
      
      user: c.user,
      mentions: c.mentions,
      inquiry: c.inquiry,
      createdAt: c.createdAt,
    }));

    // Shape stage todos
    const stageTodos = stageInquiries.map((inq: any) => ({
      id: `stage-${inq.id}`,
      type: 'stage',
      dueDate: inq.stageDueDate,
      dueDateStatus: classify(inq.stageDueDate, inq.stageIsCompleted),
      content: `Stage: "${inq.stage}" — follow up required`,
      user: inq.sales_person,
      mentions: (inq.sales_persons || []).map((u: any) => ({ user: u })),
      inquiry: {
        id: inq.id,
        inquiry_number: inq.inquiry_number,
        client_name: inq.client_name,
        stage: inq.stage,
      },
      createdAt: inq.updated_at || inq.created_at,
    }));

    // Merge & sort by newest added first (createdAt descending)
    const all = [...commentTodos, ...stageTodos].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    res.json(all);
  } catch (error) {
    console.error('Todo items error:', error);
    res.status(500).json({ error: 'Failed to fetch todo items' });
  }
});
// ==========================================
// PUT /api/pipeline/todo-items/:type/:id/complete
// ==========================================
app.put('/api/pipeline/todo-items/:type/:id/complete', authenticateToken, async (req: any, res: Response) => {
  try {
    const { type, id } = req.params;
    if (type === 'comment') {
      const dbId = id.replace('comment-', '');
      await (prisma as any).inquiryComment.update({
        where: { id: dbId },
        data: { isCompleted: true }
      });
    } else if (type === 'stage') {
      const dbId = id.replace('stage-', '');
      await prisma.inquiry.update({
        where: { id: dbId },
        data: { stageIsCompleted: true }
      });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Complete todo error:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));