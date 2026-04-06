
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
        logins:  entries.filter((e: any) => e.action === 'LOGIN').length,
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
app.put('/api/employees/:id', authenticateToken, requireRole(['super_admin']), async (req: any, res: Response) => {
  const { id } = req.params;
  const { name, mobile_number, role } = req.body;
  try {
    const updated = await prisma.user.update({
      where: { id },
      data: { name, mobile_number, role },
    });

    // [LOG]
    await logActivity(req.user.id, 'UPDATE', 'EMPLOYEE', id, `Updated employee: ${name}`);

    res.json(updated);
  } catch (error) {
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

    // Row 1 = group headers (Delear Price / Customer Rate / Design Repeat)
    // Row 2 = actual column headers
    // Row 3+ = data
    // So range:1 means "use row index 1 (row 2) as headers"
    const data: any[] = xlsx.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: '',
      blankrows: false,
      range: 1  // Skip row 1 group headers, treat row 2 as column headers
    });

    if (data.length === 0) {
      res.status(400).json({ error: 'Excel sheet is empty or has no data rows' });
      return;
    }

    // Skip the first item if it's the group header row leaking through
    // (safety check: if Sr. No is not a number, skip it)
    const cleanData = data.filter(row => {
      const srNo = row['Sr. No'] ?? row['Sr No'];
      return srNo !== undefined && srNo !== '' && !isNaN(parseFloat(String(srNo)));
    });

    let productsCreated = 0;
    const errors: string[] = [];

    const SKIP_COLUMNS = new Set([
      'Sr. No', 'Sr No', 'Collection', 'Design/ Quality',
      'RRP', 'CL Landing Cost', 'RL Landing Cost',
      'GST Amount', 'MRP'   // formula-derived, skip from attributes
    ]);

    for (let i = 0; i < cleanData.length; i++) {
      const row = cleanData[i];
      const rowNumber = i + 3; // actual Excel row number

      const srNo = (row['Sr. No'] ?? row['Sr No'])?.toString().trim();
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

      // Find or create catalog grouped by Collection name
      let catalog = await prisma.catalog.findFirst({ where: { name: collection, companyId } });
      if (!catalog) {
        catalog = await prisma.catalog.create({
          data: { name: collection, companyId, type: defaultType || 'Curtains' }
        });
      }

      // Save all extra columns as attributes
      const attributes: any = {};
      for (const col in row) {
        if (SKIP_COLUMNS.has(col.trim())) continue;
        const val = row[col];
        if (val !== undefined && val !== null && val !== '') {
          attributes[col.trim()] = String(val).trim();
        }
      }

      // Store Sr. No explicitly
      if (srNo) attributes['Sr. No'] = srNo;

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

// UPDATE POST /api/inquiries
app.post('/api/inquiries', authenticateToken, async (req: any, res: Response) => {
  const {
    client_name, architect_id_name, architectId, mobile_number, inquiry_date, address,
    sales_person_id, expected_final_date,
    client_birth_date, client_anniversary_date // <--- New Fields
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
        architect_id_name, // Manual name
        architectId: architectId || null, // Linked ID
        mobile_number,
        inquiry_date: new Date(inquiry_date),
        address,
        sales_person_id,
        expected_final_date: expected_final_date ? new Date(expected_final_date) : null,
        client_birth_date: client_birth_date ? new Date(client_birth_date) : null,
        client_anniversary_date: client_anniversary_date ? new Date(client_anniversary_date) : null,
        created_by_id: req.user.id,
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
  try {
    // 1. Fetch first so we have the number for the log
    const inquiry = await prisma.inquiry.findUnique({ where: { id } });

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
            areaName: item.details?.areaName || item.areaName || 'Unknown Area',
            catalogName: item.details?.catalogName || item.catalogName || '',
            catalogType: item.details?.catalogType || item.catalogType || '',
            companyId: item.details?.companyId || item.companyId || '',
            ...(item.details || {})
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

// [FILE: src/index.ts]

// GET PIPELINE BOARD DATA
app.get('/api/pipeline', authenticateToken, async (req: any, res: Response) => {
  try {
    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'admin_hr';

    // Filter: Agents see Inquiries they own OR are assigned to
    const whereClause = isAdmin ? {} : {
      OR: [
        { sales_person_id: req.user.id },
        { sales_persons: { some: { id: req.user.id } } }
      ]
    };

    const inquiries = await prisma.inquiry.findMany({
      where: whereClause,
      include: {
        sales_person: { select: { id: true, name: true } },
        sales_persons: { select: { id: true, name: true } },
        comments: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' }
        },
        checklists: {
          include: { items: { orderBy: { id: 'asc' } } }
        },
        labels: true,
        // ✅ FETCH LINKED QUOTATIONS (Removing 'select' to fetch full object)
        selections: {
          include: {
            quotations: {
              orderBy: { created_at: 'desc' }, // Latest quote first
              take: 1
            }
          }
        }
      },
      orderBy: { updated_at: 'desc' }
    });

    res.json(inquiries);
  } catch (error) {
    console.error('Pipeline Error:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline' });
  }
});

// 2. MOVE CARD (Update Stage)
app.put('/api/inquiries/:id/stage', authenticateToken, async (req: any, res: Response) => {
  const { id } = req.params;
  const { stage } = req.body; // e.g., "Quotation Submitted"

  try {
    const updated = await prisma.inquiry.update({
      where: { id },
      data: { stage }
    });

    // Log the movement for Admin visibility
  await logActivity(req.user.id, 'UPDATE', 'INQUIRY_STAGE', id, `Stage changed → "${stage}" for inquiry ${updated.inquiry_number}`);


    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to move card' });
  }
});

// 3. ADD COMMENT TO INQUIRY
app.post('/api/inquiries/:id/comments', authenticateToken, async (req: any, res: Response) => {
  const { id } = req.params;
  const { content, attachmentUrl } = req.body; // <--- Accept attachmentUrl

  try {
    const comment = await prisma.inquiryComment.create({
      data: {
        content: content || '', // Allow empty content if there is an image
        attachmentUrl: attachmentUrl || null,
        inquiryId: id,
        userId: req.user.id
      },
      include: { user: { select: { name: true } } }
    });
    await logActivity(req.user.id, 'CREATE', 'COMMENT', comment.id, `Added a comment to Inquiry`);
    res.json(comment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to post comment' });
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
// Report day = 6PM previous day → 6PM current day
// ==========================================

const getReportWindow = (dateInput?: string) => {
  // If no date given, use "today"
  const base = dateInput ? new Date(dateInput) : new Date();

  // 🚨 FIX: If it is past 6:00 PM (18:00), shift to tomorrow's report cycle
  if (!dateInput && base.getHours() >= 18) {
    base.setDate(base.getDate() + 1);
  }

  // Normalize to just the date portion
  const year = base.getFullYear();
  const month = base.getMonth();
  const day = base.getDate();

  // Window end = 6PM on the given day
  const windowEnd = new Date(year, month, day, 18, 0, 0, 0);

  // Window start = 6PM on the previous day
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

  // Canonical report date (stored as 6PM of the current day)
  return { windowStart, windowEnd, reportDate: windowEnd };
};


// ==========================================
// ADMIN & EMPLOYEE: Inquiry Timeline
// GET /api/daily-reports/inquiry/:inquiryId/timeline
// ==========================================
// Replace your existing /api/daily-reports/inquiry/:inquiryId/timeline route with this:

app.get('/api/daily-reports/inquiry/:inquiryId/timeline', authenticateToken, async (req: any, res: Response) => {
  try {
    // 1. Fetch Manual Daily Report Entries
    const manualEntries = await (prisma as any).dailyReportEntry.findMany({
      where: { inquiryId: req.params.inquiryId },
      include: {
        dailyReport: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Fetch Automated Activity Logs for this Inquiry
    const autoLogs = await prisma.activityLog.findMany({
      where: { 
        entityId: req.params.inquiryId,
        entity: { in: ['INQUIRY', 'INQUIRY_STAGE', 'INQUIRY_OWNER', 'INQUIRY_MEMBERS', 'COMMENT', 'CHECKLIST', 'LABEL'] }
      },
      orderBy: { createdAt: 'desc' },
    });

    // Map autoLogs to look like manualEntries so the frontend timeline UI doesn't break
    const formattedAutoLogs = autoLogs.map(log => ({
      id: log.id,
      workDone: `[System Log] ${log.details}`,
      status: 'system_action', // You can map this to a custom color in STATUS_COLORS in frontend
      createdAt: log.createdAt,
      dailyReport: {
        reportDate: log.createdAt,
        user: { id: log.userId, name: 'System / Staff' } // Ideally you fetch the user's name here if needed
      }
    }));

    // Combine and sort by date
    const combinedTimeline = [...manualEntries, ...formattedAutoLogs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const inquiry = await prisma.inquiry.findUnique({
      where: { id: req.params.inquiryId },
      select: {
        id: true,
        inquiry_number: true,
        client_name: true,
        stage: true,
        sales_person: { select: { id: true, name: true } },
      },
    });

    res.json({ inquiry, timeline: combinedTimeline });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});
// ==========================================
// EMPLOYEE: Get My History
// GET /api/daily-reports/my-history
// ==========================================

app.get('/api/daily-reports/my-history', authenticateToken, async (req: any, res: Response) => {
  try {
    // Fetch the parent DailyReport to ensure we get days with ONLY Other Work
    const reports = await (prisma as any).dailyReport.findMany({
      where: {
        userId: req.user.id
      },
      include: {
        entries: {
          include: {
            inquiry: {
              select: {
                id: true,
                inquiry_number: true,
                client_name: true,
                stage: true
              }
            }
          }
        }
      },
      orderBy: {
        reportDate: 'desc' // Newest first
      }
    });

    res.json(reports);
  } catch (error) {
    console.error('My history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ==========================================
// EMPLOYEE: Submit / Update Daily Report
// POST /api/daily-reports
// ==========================================
// ==========================================
// EMPLOYEE: Submit / Update Daily Report
// POST /api/daily-reports
// ==========================================
app.post('/api/daily-reports', authenticateToken, async (req: any, res: Response) => {
  try {
    // 1. Extract entries AND otherWork from the request
    const { entries, otherWork, reportDate: reportDateStr } = req.body;

    // 2. Validate: They must submit EITHER inquiry entries OR otherWork text
    const hasEntries = entries && Array.isArray(entries) && entries.length > 0;
    const hasOtherWork = otherWork && typeof otherWork === 'string' && otherWork.trim().length > 0;

    if (!hasEntries && !hasOtherWork) {
      return res.status(400).json({ error: 'Please update inquiries or log other work' });
    }

    const { reportDate } = getReportWindow(reportDateStr);

    // 3. Upsert the DailyReport record (Include otherWork here)
    const report = await (prisma as any).dailyReport.upsert({
      where: {
        userId_reportDate: {
          userId: req.user.id,
          reportDate,
        },
      },
      update: {
        status: 'SUBMITTED',
        otherWork: otherWork || null, // <--- ADDED THIS
        submittedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        userId: req.user.id,
        reportDate,
        status: 'SUBMITTED',
        otherWork: otherWork || null, // <--- ADDED THIS
      },
    });

    // 4. Handle Inquiry Entries (if any exist)
    await (prisma as any).dailyReportEntry.deleteMany({
      where: { dailyReportId: report.id },
    });

    if (hasEntries) {
      await (prisma as any).dailyReportEntry.createMany({
        data: entries.map((e: any) => ({
          dailyReportId: report.id,
          inquiryId: e.inquiryId,
          workDone: e.workDone,
          status: e.status,
        })),
      });
    }

    // 5. Activity Logging
    const entryCount = hasEntries ? entries.length : 0;
    let logMessage = `Submitted daily report. Updated ${entryCount} inquiries.`;
    if (hasOtherWork) logMessage += ` Included other work activities.`;

    await logActivity(req.user.id, 'CREATE', 'DAILY_REPORT', report.id, logMessage);

    res.json({ success: true, reportId: report.id });
  } catch (error) {
    console.error('Daily report submit error:', error);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// ==========================================
// EMPLOYEE: Get today's assigned inquiries + existing report
// GET /api/daily-reports/my-today
// ==========================================


app.get('/api/daily-reports/my-today', authenticateToken, async (req: any, res: Response) => {
  try {
    const { windowStart, windowEnd, reportDate } = getReportWindow();

    // Get inquiries assigned to this user (as sales_person OR member)
    const inquiries = await prisma.inquiry.findMany({
      where: {
        OR: [
          { sales_person_id: req.user.id },
          { sales_persons: { some: { id: req.user.id } } },
        ],
      },
      select: {
        id: true,
        inquiry_number: true,
        client_name: true,
        stage: true,
        inquiry_date: true,
        address: true,
        reportEntries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            workDone: true,
            createdAt: true,
            dailyReport: { select: { reportDate: true } },
          },
        },
      },
      orderBy: { inquiry_date: 'desc' },
    });

    // Check for today's existing report
    const existingReport = await (prisma as any).dailyReport.findUnique({
      where: { userId_reportDate: { userId: req.user.id, reportDate } },
      include: {
        entries: {
          include: {
            inquiry: { select: { id: true, inquiry_number: true, client_name: true } },
          },
        },
      },
    });

    // Flag inquiries inactive (2 days = yellow, 3+ days = red)
    const nowMs = Date.now();
    const enriched = inquiries.map((inq: any) => {
      const lastEntry = inq.reportEntries?.[0];
      const lastUpdate = lastEntry ? new Date(lastEntry.createdAt) : null;
      
      const daysInactive = lastUpdate ? Math.floor((nowMs - lastUpdate.getTime()) / (1000 * 60 * 60 * 24)) : 999;
      const isInactive = daysInactive >= 3; 

      return {
        ...inq,
        lastStatus: lastEntry?.status || null,
        lastWorkDone: lastEntry?.workDone || null,
        lastUpdatedAt: lastUpdate,
        daysInactive,
        isInactive,
      };
    });

    res.json({
      inquiries: enriched,
      existingReport: existingReport || null,
      reportDate,
    });
  } catch (error) {
    console.error('My today error:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});


// ==========================================
// ADMIN: Get all daily reports (filterable)
// GET /api/daily-reports/admin
// ==========================================
app.get('/api/daily-reports/admin', authenticateToken, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin_hr') {
      return res.status(403).json({ error: 'Access Denied' });
    }

    const { date, userId, inquiryId, status } = req.query as any;

    // Build where clause for entries
    const entryWhere: any = {};
    if (inquiryId) entryWhere.inquiryId = inquiryId;
    if (status) entryWhere.status = status;

    // 🚨 FIX: Only apply the reportDate filter if a date is actually passed
    const reportWhere: any = {
      ...(userId ? { userId } : {}),
    };

    if (date) {
      const { reportDate } = getReportWindow(date);
      reportWhere.reportDate = reportDate;
    }

    // Fetch submitted reports
    const reports = await (prisma as any).dailyReport.findMany({
      where: reportWhere,
      include: {
        user: { select: { id: true, name: true, role: true } },
        entries: {
          where: Object.keys(entryWhere).length > 0 ? entryWhere : undefined,
          include: {
            inquiry: {
              select: {
                id: true,
                inquiry_number: true,
                client_name: true,
                stage: true,
                address: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    // 🚨 FIX: Only calculate "Missing Users" if a specific date is selected
    let missingUsers: any[] = [];
    if (date) {
      const salesUsers = await prisma.user.findMany({
        where: { role: { in: ['sales', 'accounting', 'admin_hr'] } },
        select: { id: true, name: true, role: true, email: true },
      });
      const targetUsers = userId ? salesUsers.filter((u: any) => u.id === userId) : salesUsers;
      const submittedUserIds = new Set(reports.map((r: any) => r.userId));
      
      missingUsers = targetUsers
        .filter((u: any) => !submittedUserIds.has(u.id))
        .map((u: any) => ({ ...u, status: 'MISSING' }));
    }

    res.json({ reports, missingUsers, reportDate: date ? getReportWindow(date).reportDate : null });
  } catch (error) {
    console.error('Admin reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});


// ==========================================
// ADMIN: Analytics Summary
// GET /api/daily-reports/analytics
// Query: ?date=YYYY-MM-DD
// ==========================================
app.get('/api/daily-reports/analytics', authenticateToken, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin_hr') {
      return res.status(403).json({ error: 'Access Denied' });
    }

    const { date } = req.query as any;
    const { reportDate } = date ? getReportWindow(date) : getReportWindow();

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // Adjusted to 2 days

    const [
      totalEmployees,
      submittedReports,
      allEntries,
      inactiveInquiries,
      allInquiries,
    ] = await Promise.all([
      prisma.user.count({ where: { role: { in: ['sales', 'accounting', 'admin_hr'] } } }),
      (prisma as any).dailyReport.count({ where: { reportDate, status: 'SUBMITTED' } }),
      (prisma as any).dailyReportEntry.findMany({
        where: { dailyReport: { reportDate } },
        select: { status: true, inquiryId: true },
      }),
      // Inquiries with no report entry in last 2+ days
      prisma.inquiry.findMany({
        where: {
          reportEntries: {
            none: {
              createdAt: { gte: twoDaysAgo },
            },
          },
        },
        select: {
          id: true,
          inquiry_number: true,
          client_name: true,
          stage: true,
          sales_person: { select: { id: true, name: true } },
          reportEntries: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true, status: true },
          },
        },
      }),
      prisma.inquiry.count(),
    ]);

    // Status distribution
    const statusMap: Record<string, number> = {};
    for (const e of allEntries) {
      statusMap[e.status] = (statusMap[e.status] || 0) + 1;
    }

    // Unique inquiries worked today
    const uniqueInquiriesWorked = new Set(allEntries.map((e: any) => e.inquiryId)).size;

    res.json({
      totalEmployees,
      reportsSubmitted: submittedReports,
      reportsMissing: Math.max(0, totalEmployees - submittedReports),
      totalInquiriesWorked: uniqueInquiriesWorked,
      totalInquiries: allInquiries,
      inactiveInquiries: inactiveInquiries.slice(0, 50), // Cap for performance
      inactiveCount: inactiveInquiries.length,
      statusDistribution: statusMap,
      reportDate,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});


// ==========================================
// ADMIN: Inquiry Timeline
// GET /api/daily-reports/inquiry/:inquiryId/timeline
// ==========================================
app.get('/api/daily-reports/inquiry/:inquiryId/timeline', authenticateToken, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin_hr') {
      return res.status(403).json({ error: 'Access Denied' });
    }

    const entries = await (prisma as any).dailyReportEntry.findMany({
      where: { inquiryId: req.params.inquiryId },
      include: {
        dailyReport: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const inquiry = await prisma.inquiry.findUnique({
      where: { id: req.params.inquiryId },
      select: {
        id: true,
        inquiry_number: true,
        client_name: true,
        stage: true,
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
    const role   = req.user.role;
    const now    = new Date();

    // Reporting window end = 6PM today
    const todayAt6PM = new Date(now);
    todayAt6PM.setHours(18, 0, 0, 0);

    const reportDate = todayAt6PM; // canonical report date

    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const notifications: any[] = [];

    // ── SUPER ADMIN / ADMIN HR ──────────────────────────────────────────────
    if (role === 'super_admin' || role === 'admin_hr') {

      // 1. Missing daily reports — sales employees who haven't submitted today
      const salesUsers = await prisma.user.findMany({
        where: { role: { in: ['sales', 'accounting'] } },
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
          id: 'missing-reports',
          type: 'missing_report',
          title: `${missingCount} Report${missingCount > 1 ? 's' : ''} Missing`,
          message: `${missingNames.slice(0, 3).join(', ')}${missingNames.length > 3 ? ` +${missingNames.length - 3} more` : ''} ${missingCount === 1 ? 'has' : 'have'} not submitted today's report.`,
          link: '/daily-reports/admin',
          severity: 'warning',
          createdAt: now.toISOString(),
        });
      }

      // 2. Inactive inquiries (2+ days no update)
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
          title: `${inactiveInquiries.length} Inactive Inquir${inactiveInquiries.length > 1 ? 'ies' : 'y'}`,
          message: `No update for 2+ days: ${inactiveInquiries.slice(0, 2).map((i: any) => i.inquiry_number).join(', ')}${inactiveInquiries.length > 2 ? ` +${inactiveInquiries.length - 2} more` : ''}.`,
          link: '/daily-reports/admin?tab=inactive',
          severity: 'error',
          createdAt: now.toISOString(),
        });
      }

      // 3. Pending leave requests
      const pendingLeaves = await prisma.leaveRequest.count({
        where: { status: 'PENDING' },
      });
      if (pendingLeaves > 0) {
        notifications.push({
          id: 'pending-leaves',
          type: 'leave_request',
          title: `${pendingLeaves} Pending Leave${pendingLeaves > 1 ? 's' : ''}`,
          message: `${pendingLeaves} leave request${pendingLeaves > 1 ? 's' : ''} awaiting your approval.`,
          link: '/attendance',
          severity: 'info',
          createdAt: now.toISOString(),
        });
      }

      // 4. Client birthdays today
      const allInquiries = await prisma.inquiry.findMany({
        where: { client_birth_date: { not: null } },
        select: { id: true, client_name: true, client_birth_date: true, inquiry_number: true },
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
          message: birthdaysToday.slice(0, 3).map((i: any) => i.client_name).join(', ') + (birthdaysToday.length > 3 ? ` +${birthdaysToday.length - 3} more` : ''),
          link: '/inquiries',
          severity: 'info',
          createdAt: now.toISOString(),
        });
      }

      // 5. Client anniversaries today
      const anniversariesToday = allInquiries.filter((inq: any) => {
        if (!inq.client_anniversary_date) return false;
        const ad = new Date(inq.client_anniversary_date);
        return ad.getDate() === now.getDate() && ad.getMonth() === now.getMonth();
      });
      if (anniversariesToday.length > 0) {
        notifications.push({
          id: 'anniversaries-today',
          type: 'anniversary',
          title: `💍 ${anniversariesToday.length} Anniversary Today`,
          message: anniversariesToday.slice(0, 3).map((i: any) => i.client_name).join(', ') + (anniversariesToday.length > 3 ? ` +${anniversariesToday.length - 3} more` : ''),
          link: '/inquiries',
          severity: 'info',
          createdAt: now.toISOString(),
        });
      }
    }

    // ── SALES ───────────────────────────────────────────────────────────────
    if (role === 'sales') {

      // 1. Own daily report not submitted today (within window)
      if (now < todayAt6PM) {
        const myReport = await (prisma as any).dailyReport.findUnique({
          where: { userId_reportDate: { userId, reportDate } },
        });
        if (!myReport) {
          const msLeft = todayAt6PM.getTime() - now.getTime();
          const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
          const minsLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
          notifications.push({
            id: 'own-report-missing',
            type: 'missing_report',
            title: `🚨 Compulsory Daily Report Pending`,
            message: `You MUST submit your report. ${hoursLeft}h ${minsLeft}m left before the window closes. If no work was done, submit an empty update.`,
            link: '/daily-report',
            severity: 'error',
            createdAt: now.toISOString(),
          });
        }
      }

      // 2. Own inactive inquiries (2+ days)
      const myInactiveInquiries = await prisma.inquiry.findMany({
        where: {
          OR: [
            { sales_person_id: userId },
            { sales_persons: { some: { id: userId } } },
          ],
          reportEntries: { none: { createdAt: { gte: twoDaysAgo } } },
        },
        select: { id: true, inquiry_number: true, client_name: true },
      });
      if (myInactiveInquiries.length > 0) {
        notifications.push({
          id: 'my-inactive-inquiries',
          type: 'inactive_inquiry',
          title: `${myInactiveInquiries.length} Inactive Inquir${myInactiveInquiries.length > 1 ? 'ies' : 'y'}`,
          message: `Action needed! No update in 2+ days: ${myInactiveInquiries.slice(0, 2).map((i: any) => i.inquiry_number).join(', ')}.`,
          link: '/daily-report',
          severity: 'error',
          createdAt: now.toISOString(),
        });
      }

      // 3. Birthdays/anniversaries for own clients today
      const myInquiries = await prisma.inquiry.findMany({
        where: {
          OR: [
            { sales_person_id: userId },
            { sales_persons: { some: { id: userId } } },
          ],
          client_birth_date: { not: null },
        },
        select: { id: true, client_name: true, client_birth_date: true, client_anniversary_date: true },
      });
      const myBirthdays = myInquiries.filter((inq: any) => {
        if (!inq.client_birth_date) return false;
        const bd = new Date(inq.client_birth_date);
        return bd.getDate() === now.getDate() && bd.getMonth() === now.getMonth();
      });
      if (myBirthdays.length > 0) {
        notifications.push({
          id: 'my-client-birthdays',
          type: 'birthday',
          title: `🎂 Client Birthday Today`,
          message: myBirthdays.map((i: any) => i.client_name).join(', '),
          link: '/inquiries',
          severity: 'info',
          createdAt: now.toISOString(),
        });
      }
    }

    // ── ACCOUNTING ──────────────────────────────────────────────────────────
    if (role === 'accounting') {

      // 1. Pending selections
      const pendingSelections = await prisma.selection.count({
        where: { status: 'pending' },
      });
      if (pendingSelections > 0) {
        notifications.push({
          id: 'pending-selections',
          type: 'pending_selection',
          title: `${pendingSelections} Pending Selection${pendingSelections > 1 ? 's' : ''}`,
          message: `${pendingSelections} selection${pendingSelections > 1 ? 's' : ''} waiting to be confirmed.`,
          link: '/selections',
          severity: 'warning',
          createdAt: now.toISOString(),
        });
      }

      // 2. Draft quotations
      const draftQuotations = await prisma.quotation.count({
        where: { status: 'draft' },
      });
      if (draftQuotations > 0) {
        notifications.push({
          id: 'draft-quotations',
          type: 'draft_quotation',
          title: `${draftQuotations} Draft Quotation${draftQuotations > 1 ? 's' : ''}`,
          message: `${draftQuotations} quotation${draftQuotations > 1 ? 's are' : ' is'} still in draft.`,
          link: '/quotations',
          severity: 'info',
          createdAt: now.toISOString(),
        });
      }
    }

    // Sort: errors first, then warnings, then info
    const order = { error: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => (order[a.severity as keyof typeof order] ?? 3) - (order[b.severity as keyof typeof order] ?? 3));

    res.json({ notifications, count: notifications.length });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));