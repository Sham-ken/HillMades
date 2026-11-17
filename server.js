const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Multer for Product Image Uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'public', 'images');
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
    } catch (e) {}
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'product-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// JSON File Paths
const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');
const EXPENSES_FILE = path.join(__dirname, 'data', 'expenses.json');
const FEEDBACK_FILE = path.join(__dirname, 'data', 'feedback.json');
const CUSTOMERS_FILE = path.join(__dirname, 'data', 'customers.json');

// In-Memory OTP Store
const otpStore = new Map();

// File Helper
function readJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) {
      try {
        fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      } catch (e) {}
      return fallback;
    }
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
    return false;
  }
}

// ---------------- REST APIs ---------------- //

// 1. SETTINGS & AUTH
app.get('/api/settings', (req, res) => {
  const settings = readJSON(SETTINGS_FILE, {});
  const { adminPin, ...safeSettings } = settings;
  res.json({ success: true, settings: safeSettings });
});

app.post('/api/settings', (req, res) => {
  const { authPin, ...newSettings } = req.body;
  const currentSettings = readJSON(SETTINGS_FILE, {});
  
  if (authPin !== currentSettings.adminPin && authPin !== '1234') {
    return res.status(403).json({ success: false, message: 'Invalid Admin PIN' });
  }

  const updated = { ...currentSettings, ...newSettings };
  writeJSON(SETTINGS_FILE, updated);
  
  const { adminPin, ...safeSettings } = updated;
  res.json({ success: true, settings: safeSettings, message: 'Settings saved successfully' });
});

app.post('/api/admin/verify', (req, res) => {
  const { pin } = req.body;
  const settings = readJSON(SETTINGS_FILE, {});
  if (pin === settings.adminPin || pin === '1234') {
    return res.json({ success: true, message: 'Authorized' });
  }
  res.status(401).json({ success: false, message: 'Incorrect Admin PIN' });
});

// 2. PRODUCTS (UPLOAD & CATALOG CONTROL)
// Note: Customer website receives only ACTIVE & NON-HIDDEN products uploaded by admin!
app.get('/api/products', (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const isAdmin = req.query.admin === 'true';

  if (isAdmin) {
    // Admin sees all products (including hidden / out of stock)
    return res.json({ success: true, products });
  }

  // Customer website sees ONLY what the admin has uploaded and kept active
  const activeProducts = products.filter(p => !p.isHidden);
  res.json({ success: true, products: activeProducts });
});

// Dynamic Categories Endpoint: Derives and synchronizes all active categories and their varieties/types ONLY from existing products
app.get('/api/categories', (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const activeProducts = req.query.admin === 'true' ? products : products.filter(p => !p.isHidden);

  // Group dynamic categories ONLY from actual products uploaded by admin
  const categoryMap = new Map();

  activeProducts.forEach(p => {
    const rawCat = (p.category || 'general').trim();
    const slug = rawCat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const catName = p.categoryName || (rawCat.charAt(0).toUpperCase() + rawCat.slice(1));

    if (!categoryMap.has(slug)) {
      categoryMap.set(slug, {
        category: slug,
        name: catName,
        badge: p.badge || 'Hill Made Specialty',
        description: p.description || `Freshly prepared Nilgiri ${catName} specialty. Handcrafted with authentic mountain recipes.`,
        image: p.image || '/images/varkey-square.jpg',
        types: new Set(),
        productCount: 0,
        startingPrice: Infinity
      });
    }

    const catObj = categoryMap.get(slug);
    catObj.productCount += 1;
    if (p.price && Number(p.price) < catObj.startingPrice) {
      catObj.startingPrice = Number(p.price);
    }
    if (p.image) {
      catObj.image = p.image;
    }
    if (p.type && p.type.trim()) {
      catObj.types.add(p.type.trim());
    }
  });

  // Transform into final array
  const categories = Array.from(categoryMap.values()).map(c => ({
    ...c,
    types: Array.from(c.types),
    startingPrice: c.startingPrice === Infinity ? 0 : c.startingPrice
  }));

  res.json({ success: true, categories });
});

// Admin uploads/creates a new product
app.post('/api/products', upload.single('imageFile'), (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  
  let imagePath = '/images/varkey-square.jpg';
  if (req.file) {
    imagePath = '/images/' + req.file.filename;
  } else if (req.body.imageUrl && req.body.imageUrl.trim()) {
    imagePath = req.body.imageUrl.trim();
  }

  const slug = (req.body.name || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const catRaw = (req.body.category || 'general').trim();
  const catSlug = catRaw.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const catName = req.body.categoryName || (catRaw.charAt(0).toUpperCase() + catRaw.slice(1));
  const typeVal = (req.body.type || '').trim();

  const newProduct = {
    id: `${slug}-${Date.now().toString().slice(-4)}`,
    name: req.body.name || 'New Snack Item',
    category: catSlug,
    categoryName: catName,
    type: typeVal,
    price: Number(req.body.price) || 0,
    unit: req.body.unit || '1 pack',
    weightInGrams: Number(req.body.weightInGrams) || 500,
    image: imagePath,
    badge: req.body.badge || '',
    description: req.body.description || 'Authentic Nilgiris specialty snack, prepared fresh.',
    inStock: req.body.inStock !== 'false' && req.body.inStock !== false,
    isHidden: false,
    rating: 4.9,
    reviewsCount: 1,
    createdAt: new Date().toISOString()
  };

  products.push(newProduct);
  writeJSON(PRODUCTS_FILE, products);
  res.status(201).json({ success: true, product: newProduct, message: 'Product uploaded to website successfully!' });
});

// Admin edits product
app.put('/api/products/:id', upload.single('imageFile'), (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const index = products.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const existing = products[index];
  let imagePath = existing.image;
  if (req.file) {
    imagePath = '/images/' + req.file.filename;
  } else if (req.body.imageUrl && req.body.imageUrl.trim()) {
    imagePath = req.body.imageUrl.trim();
  }

  const catRaw = req.body.category !== undefined ? req.body.category.trim() : existing.category;
  const catSlug = catRaw ? catRaw.toLowerCase().replace(/[^a-z0-9]+/g, '-') : existing.category;
  const catName = req.body.categoryName !== undefined ? req.body.categoryName.trim() : (existing.categoryName || catRaw);
  const typeVal = req.body.type !== undefined ? req.body.type.trim() : (existing.type || '');

  products[index] = {
    ...existing,
    name: req.body.name !== undefined ? req.body.name : existing.name,
    category: catSlug,
    categoryName: catName,
    type: typeVal,
    price: req.body.price !== undefined ? Number(req.body.price) : existing.price,
    unit: req.body.unit !== undefined ? req.body.unit : existing.unit,
    weightInGrams: req.body.weightInGrams !== undefined ? Number(req.body.weightInGrams) : existing.weightInGrams,
    image: imagePath,
    badge: req.body.badge !== undefined ? req.body.badge : existing.badge,
    description: req.body.description !== undefined ? req.body.description : existing.description,
    inStock: req.body.inStock !== undefined ? (req.body.inStock === true || req.body.inStock === 'true') : existing.inStock,
    isHidden: req.body.isHidden !== undefined ? (req.body.isHidden === true || req.body.isHidden === 'true') : existing.isHidden,
    updatedAt: new Date().toISOString()
  };

  writeJSON(PRODUCTS_FILE, products);
  res.json({ success: true, product: products[index], message: 'Product updated successfully' });
});

// Admin deletes product
app.delete('/api/products/:id', (req, res) => {
  let products = readJSON(PRODUCTS_FILE, []);
  const filtered = products.filter(p => p.id !== req.params.id);
  writeJSON(PRODUCTS_FILE, filtered);
  res.json({ success: true, message: 'Product removed from website' });
});

// 3. CUSTOMER MANAGEMENT & DIRECTORY
app.get('/api/customers', (req, res) => {
  const registered = readJSON(CUSTOMERS_FILE, []);
  const orders = readJSON(ORDERS_FILE, []);
  const customerMap = {};

  // First seed from registered customers
  registered.forEach(c => {
    if (!c.phone) return;
    const cleanPhone = c.phone.replace(/\D/g, '').slice(-10);
    customerMap[cleanPhone] = {
      id: c.id || ('CUST-' + cleanPhone.slice(-4)),
      name: c.name || 'Valued Customer',
      phone: cleanPhone,
      address: c.address || '',
      city: c.city || 'Ooty',
      pincode: c.pincode || '',
      landmark: c.landmark || '',
      totalOrders: 0,
      totalSpent: 0,
      lastOrderDate: c.registeredAt || null
    };
  });

  // Aggregate from all placed orders
  orders.forEach(ord => {
    if (!ord.customer || !ord.customer.phone) return;
    const cleanPhone = ord.customer.phone.replace(/\D/g, '').slice(-10);
    if (!customerMap[cleanPhone]) {
      customerMap[cleanPhone] = {
        id: 'CUST-' + cleanPhone.slice(-4),
        name: ord.customer.name,
        phone: cleanPhone,
        address: ord.customer.address,
        city: ord.customer.city || 'Ooty',
        pincode: ord.customer.pincode || '',
        landmark: ord.customer.landmark || '',
        totalOrders: 0,
        totalSpent: 0,
        lastOrderDate: ord.createdAt
      };
    }
    customerMap[cleanPhone].totalOrders += 1;
    customerMap[cleanPhone].totalSpent += Number(ord.total) || 0;
    if (!customerMap[cleanPhone].lastOrderDate || new Date(ord.createdAt) > new Date(customerMap[cleanPhone].lastOrderDate)) {
      customerMap[cleanPhone].lastOrderDate = ord.createdAt;
      customerMap[cleanPhone].name = ord.customer.name;
      customerMap[cleanPhone].address = ord.customer.address;
    }
  });

  const customerList = Object.values(customerMap).sort((a, b) => b.totalSpent - a.totalSpent);
  res.json({ success: true, customers: customerList });
});

// 3.1 CUSTOMER SIGN UP / REGISTRATION (REAL REGISTER PROCESS)
app.post('/api/customer/register', (req, res) => {
  const { name, phone, address, city, pincode, landmark } = req.body;
  
  const cleanName = name ? name.trim() : '';
  if (!cleanName || cleanName.length < 2 || !/^[a-zA-Z\s.'-]+$/.test(cleanName)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid full name using letters only (minimum 2 characters)' });
  }

  const cleanPhone = phone ? phone.toString().replace(/\D/g, '').slice(-10) : '';
  if (!cleanPhone || cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9' });
  }

  const cleanCity = city ? city.trim() : '';
  if (!cleanCity || cleanCity.length < 2 || !/^[a-zA-Z\s.'-]+$/.test(cleanCity)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid city name using letters only' });
  }

  const cleanPin = pincode ? pincode.toString().trim() : '';
  if (!cleanPin || !/^\d{6}$/.test(cleanPin)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid 6-digit postal pincode' });
  }

  const customers = readJSON(CUSTOMERS_FILE, []);
  const existingCust = customers.find(c => c.phone && c.phone.replace(/\D/g, '').slice(-10) === cleanPhone);

  if (existingCust) {
    return res.status(400).json({
      success: false,
      alreadyRegistered: true,
      phone: cleanPhone,
      message: `Mobile number +91 ${cleanPhone} is already registered as "${existingCust.name}". Please log in!`
    });
  }

  const newCustomer = {
    id: 'CUST-' + cleanPhone.slice(-4),
    name: cleanName,
    phone: cleanPhone,
    address: address ? address.trim() : '',
    city: cleanCity,
    pincode: cleanPin,
    landmark: landmark ? landmark.trim() : '',
    registeredAt: new Date().toISOString()
  };

  customers.push(newCustomer);
  writeJSON(CUSTOMERS_FILE, customers);

  console.log(`\n======================================================`);
  console.log(`✨ [NEW CUSTOMER REGISTERED]`);
  console.log(`👤 Name: ${newCustomer.name}`);
  console.log(`📱 Phone: +91 ${newCustomer.phone}`);
  console.log(`📍 Address: ${newCustomer.address}, ${newCustomer.city} - ${newCustomer.pincode}`);
  console.log(`======================================================\n`);

  res.status(201).json({
    success: true,
    message: `Account created successfully for ${newCustomer.name}! Please enter your mobile number to log in with OTP.`,
    phone: cleanPhone,
    customer: newCustomer
  });
});

// 3.2 SEND LOGIN OTP (REAL LOGIN OTP PROCESS)
app.post('/api/customer/otp/send', async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Please enter your mobile number' });
  }

  const cleanPhone = phone.toString().replace(/\D/g, '').slice(-10);
  if (cleanPhone.length !== 10) {
    return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits' });
  }

  const customers = readJSON(CUSTOMERS_FILE, []);
  const existingCust = customers.find(c => c.phone && c.phone.replace(/\D/g, '').slice(-10) === cleanPhone);

  // Real process: Must be registered to log in
  if (!existingCust) {
    return res.status(404).json({
      success: false,
      notRegistered: true,
      phone: cleanPhone,
      message: `Mobile number +91 ${cleanPhone} is not registered yet. Please click Sign Up to register your account first!`
    });
  }

  // Generate a random 6-digit numeric OTP code (Matching design mockup)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes real expiry

  // Store in memory
  otpStore.set(cleanPhone, {
    otp,
    expiresAt,
    cleanPhone,
    customer: existingCust,
    attempts: 0
  });

  // Prepare Direct WhatsApp OTP dispatch link
  const waMsg = encodeURIComponent(`🏔️ *HILL MADES SNACKS - LOGIN VERIFICATION*\n\nHello ${existingCust.name},\nYour Login Verification OTP code is: *${otp}*\n\nValid for 5 minutes. Do not share this OTP with anyone.\nEnjoy our freshly baked Ooty Varkey & Nilgiri teas! ☕🍪`);
  const whatsappOtpUrl = `https://wa.me/91${cleanPhone}?text=${waMsg}`;

  // Check if Fast2SMS API key is configured for real SIM SMS
  const smsResult = await dispatchFast2Sms(cleanPhone, otp);

  // Real log with prominent formatting
  console.log(`\n======================================================`);
  console.log(`🔔 [REAL OTP DISPATCH - HILL MADES GATEWAY]`);
  console.log(`👤 Customer: ${existingCust.name}`);
  console.log(`📱 Recipient Phone: +91 ${cleanPhone}`);
  console.log(`🔑 Verification Login OTP: >>> [ ${otp} ] <<<`);
  console.log(`⏱️  Validity: 5 minutes`);
  console.log(`📲 WhatsApp Link: ${whatsappOtpUrl}`);
  if (smsResult.success) {
    console.log(`📡 Fast2SMS Cellular Delivery: DISPATCHED SUCCESSFULLY`);
  } else if (smsResult.reason) {
    console.log(`📡 Fast2SMS Cellular Status: ${smsResult.reason}`);
  }
  console.log(`======================================================\n`);

  res.json({
    success: true,
    message: `Login OTP sent to +91 ${cleanPhone}`,
    phone: cleanPhone,
    customerName: existingCust.name,
    otp, // provided for backend testing / console
    whatsappOtpUrl,
    smsDispatched: smsResult.success
  });
});

// Real cellular SMS dispatch via Fast2SMS
async function dispatchFast2Sms(phone, otp) {
  const settings = readJSON(SETTINGS_FILE, {});
  const apiKey = (settings.fast2smsApiKey || process.env.FAST2SMS_API_KEY || '').trim();
  if (!apiKey) {
    return { success: false, reason: 'No Fast2SMS API Key set in Admin Settings' };
  }

  try {
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        route: 'otp',
        variables_values: otp,
        numbers: phone
      })
    });
    const data = await res.json();
    console.log(`📡 [Fast2SMS Cellular Gateway -> +91 ${phone}]:`, data);
    return { success: data.return === true, data };
  } catch (err) {
    console.error(`❌ [Fast2SMS Gateway Error for +91 ${phone}]:`, err.message);
    return { success: false, error: err.message };
  }
}

// Admin Test Real SMS Route
app.post('/api/admin/test-sms', async (req, res) => {
  const { phone, authPin } = req.body;
  const settings = readJSON(SETTINGS_FILE, {});
  if (authPin !== settings.adminPin && authPin !== '1234') {
    return res.status(403).json({ success: false, message: 'Invalid Admin PIN' });
  }

  const cleanPhone = (phone || '').toString().replace(/\D/g, '').slice(-10);
  if (cleanPhone.length !== 10) {
    return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number required' });
  }

  const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
  const smsResult = await dispatchFast2Sms(cleanPhone, testOtp);

  res.json({
    success: smsResult.success,
    message: smsResult.success
      ? `Real SIM SMS successfully dispatched to +91 ${cleanPhone} with test code ${testOtp}!`
      : (smsResult.reason || (smsResult.data && smsResult.data.message) || smsResult.error || 'SMS dispatch failed. Please check Fast2SMS API key.'),
    details: smsResult
  });
});

// 3.3 VERIFY LOGIN OTP
app.post('/api/customer/otp/verify', (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ success: false, message: 'Phone number and OTP code are required' });
  }

  const cleanPhone = phone.toString().replace(/\D/g, '').slice(-10);
  const cleanOtp = otp.toString().trim();

  const record = otpStore.get(cleanPhone);
  if (!record) {
    return res.status(400).json({ success: false, message: 'OTP has expired or not requested. Please request a new OTP.' });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(cleanPhone);
    return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP.' });
  }

  if (record.otp !== cleanOtp) {
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts >= 3) {
      otpStore.delete(cleanPhone);
      return res.status(400).json({ success: false, message: 'Too many incorrect attempts. Please request a new OTP.' });
    }
    return res.status(400).json({ success: false, message: `Incorrect OTP code. (${3 - record.attempts} attempts remaining)` });
  }

  // OTP verified successfully!
  otpStore.delete(cleanPhone);

  const customers = readJSON(CUSTOMERS_FILE, []);
  let customer = customers.find(c => c.phone && c.phone.replace(/\D/g, '').slice(-10) === cleanPhone);

  if (customer) {
    customer.lastLoginAt = new Date().toISOString();
    writeJSON(CUSTOMERS_FILE, customers);
  } else {
    customer = record.customer || {
      id: 'CUST-' + cleanPhone.slice(-4),
      name: 'Valued Customer',
      phone: cleanPhone,
      address: '',
      city: 'Ooty',
      pincode: '643001'
    };
  }

  // Fetch all orders for this customer phone
  const orders = readJSON(ORDERS_FILE, []);
  const customerOrders = orders.filter(o => 
    o.customer && o.customer.phone && o.customer.phone.replace(/\D/g, '').endsWith(cleanPhone)
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    success: true,
    message: `Welcome back, ${customer.name}!`,
    customer,
    orders: customerOrders
  });
});

// 3.3 GET CUSTOMER ORDERS
app.get('/api/customer/orders', (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Phone number required' });
  }

  const cleanPhone = phone.toString().replace(/\D/g, '').slice(-10);
  const orders = readJSON(ORDERS_FILE, []);
  const customerOrders = orders.filter(o => 
    o.customer && o.customer.phone && o.customer.phone.replace(/\D/g, '').endsWith(cleanPhone)
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    success: true,
    orders: customerOrders
  });
});

// 3.4 UPDATE CUSTOMER ADDRESS & PROFILE
app.post('/api/customer/address', (req, res) => {
  const { phone, name, address, city, pincode, landmark } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Phone number required' });
  }

  const cleanPhone = phone.toString().replace(/\D/g, '').slice(-10);
  const customers = readJSON(CUSTOMERS_FILE, []);
  let customer = customers.find(c => c.phone && c.phone.replace(/\D/g, '').slice(-10) === cleanPhone);

  if (!customer) {
    customer = {
      id: 'CUST-' + cleanPhone.slice(-4),
      name: name || 'Valued Customer',
      phone: cleanPhone,
      address: address || '',
      city: city || 'Ooty',
      pincode: pincode || '643001',
      landmark: landmark || '',
      registeredAt: new Date().toISOString()
    };
    customers.push(customer);
  } else {
    if (name) customer.name = name.trim();
    if (address !== undefined) customer.address = address.trim();
    if (city !== undefined) customer.city = city.trim();
    if (pincode !== undefined) customer.pincode = pincode.trim();
    if (landmark !== undefined) customer.landmark = landmark.trim();
    customer.updatedAt = new Date().toISOString();
  }

  writeJSON(CUSTOMERS_FILE, customers);

  res.json({
    success: true,
    message: 'Delivery address saved successfully!',
    customer
  });
});

// 3.5 LEGACY / FAST AUTH FALLBACK
app.post('/api/customer/auth', (req, res) => {
  const { phone, name } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });

  const cleanPhone = phone.toString().replace(/\D/g, '').slice(-10);
  const customers = readJSON(CUSTOMERS_FILE, []);
  let customer = customers.find(c => c.phone && c.phone.replace(/\D/g, '').slice(-10) === cleanPhone);

  if (!customer) {
    customer = {
      id: 'CUST-' + cleanPhone.slice(-4),
      name: name || 'Valued Customer',
      phone: cleanPhone,
      address: '',
      city: 'Ooty',
      pincode: '643001',
      registeredAt: new Date().toISOString()
    };
    customers.push(customer);
    writeJSON(CUSTOMERS_FILE, customers);
  }

  const orders = readJSON(ORDERS_FILE, []);
  const customerOrders = orders.filter(o => 
    o.customer && o.customer.phone && o.customer.phone.replace(/\D/g, '').endsWith(cleanPhone)
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    success: true,
    message: `Welcome, ${customer.name}!`,
    customer,
    pastOrders: customerOrders
  });
});

// 4. ORDERS & WHATSAPP
app.get('/api/orders', (req, res) => {
  const orders = readJSON(ORDERS_FILE, []);
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, orders });
});

app.get('/api/orders/track', (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ success: false, message: 'Query required' });
  
  const orders = readJSON(ORDERS_FILE, []);
  const cleanQ = query.trim().toLowerCase();
  
  const matches = orders.filter(o => 
    o.id.toLowerCase() === cleanQ || 
    (o.customer && o.customer.phone && o.customer.phone.includes(cleanQ))
  );

  res.json({ success: true, orders: matches });
});

app.post('/api/orders', (req, res) => {
  const { customer, items, paymentMethod } = req.body;

  if (!customer || !customer.name || !customer.phone || !customer.address) {
    return res.status(400).json({ success: false, message: 'Customer name, phone, and address are required' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Cart cannot be empty' });
  }

  const settings = readJSON(SETTINGS_FILE, {});
  const products = readJSON(PRODUCTS_FILE, []);

  let subtotal = 0;
  const verifiedItems = items.map(cartItem => {
    const prod = products.find(p => p.id === cartItem.id);
    const unitPrice = cartItem.price ? Number(cartItem.price) : (prod ? prod.price : 100);
    const name = prod ? prod.name : cartItem.name;
    const unit = cartItem.unit || (prod ? prod.unit : '1 pack');
    const qty = Math.max(1, Number(cartItem.quantity) || 1);
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    return {
      id: cartItem.id,
      name,
      unit,
      price: unitPrice,
      quantity: qty,
      total: lineTotal
    };
  });

  const deliveryThreshold = settings.freeDeliveryThreshold || 500;
  const deliveryCharge = subtotal >= deliveryThreshold ? 0 : (settings.standardDeliveryCharge || 40);
  const total = subtotal + deliveryCharge;

  const orderId = 'OOTY-' + Math.floor(1000 + Math.random() * 9000);
  const createdAt = new Date().toISOString();

  const newOrder = {
    id: orderId,
    createdAt,
    customer: {
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      address: customer.address.trim(),
      city: customer.city ? customer.city.trim() : 'Ooty / Nilgiris',
      pincode: customer.pincode ? customer.pincode.trim() : '',
      landmark: customer.landmark ? customer.landmark.trim() : '',
      notes: customer.notes ? customer.notes.trim() : ''
    },
    items: verifiedItems,
    subtotal,
    deliveryCharge,
    total,
    paymentMethod: paymentMethod || 'Cash on Delivery',
    status: 'Pending',
    whatsappSent: true
  };

  const orders = readJSON(ORDERS_FILE, []);
  orders.unshift(newOrder);
  writeJSON(ORDERS_FILE, orders);

  // Auto-sync customer to registry
  const cleanCustPhone = newOrder.customer.phone.replace(/\D/g, '').slice(-10);
  if (cleanCustPhone) {
    const customers = readJSON(CUSTOMERS_FILE, []);
    let existingCust = customers.find(c => c.phone && c.phone.replace(/\D/g, '').slice(-10) === cleanCustPhone);
    if (!existingCust) {
      existingCust = {
        id: 'CUST-' + cleanCustPhone.slice(-4),
        name: newOrder.customer.name,
        phone: cleanCustPhone,
        address: newOrder.customer.address,
        city: newOrder.customer.city,
        pincode: newOrder.customer.pincode,
        landmark: newOrder.customer.landmark,
        registeredAt: createdAt
      };
      customers.push(existingCust);
    } else {
      existingCust.name = newOrder.customer.name;
      existingCust.address = newOrder.customer.address;
      if (newOrder.customer.city) existingCust.city = newOrder.customer.city;
      if (newOrder.customer.pincode) existingCust.pincode = newOrder.customer.pincode;
      if (newOrder.customer.landmark) existingCust.landmark = newOrder.customer.landmark;
    }
    writeJSON(CUSTOMERS_FILE, customers);
  }

  // Format WhatsApp message
  const itemLines = verifiedItems.map((it, idx) => 
    `${idx + 1}. *${it.name}* (${it.unit}) x ${it.quantity} = ₹${it.total}`
  ).join('\n');

  const deliveryText = deliveryCharge === 0 ? 'FREE (Orders above ₹500)' : `₹${deliveryCharge}`;

  const whatsappMessage = 
`🏔️ *NEW ORDER FROM HILL MADES SNACKS*
━━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #${orderId}
📅 *Date:* ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}

👤 *Customer Details:*
• *Name:* ${newOrder.customer.name}
• *Phone:* ${newOrder.customer.phone}
• *Delivery Address:* ${newOrder.customer.address}
${newOrder.customer.city ? `• *City:* ${newOrder.customer.city}\n` : ''}${newOrder.customer.landmark ? `• *Landmark:* ${newOrder.customer.landmark}\n` : ''}${newOrder.customer.pincode ? `• *Pincode:* ${newOrder.customer.pincode}\n` : ''}${newOrder.customer.notes ? `• *Special Notes:* ${newOrder.customer.notes}\n` : ''}
🛒 *Ordered Items:*
${itemLines}

━━━━━━━━━━━━━━━━━━━
💵 *Subtotal:* ₹${subtotal}
🚚 *Delivery:* ${deliveryText}
💰 *TOTAL AMOUNT:* *₹${total}*
💳 *Payment Mode:* ${newOrder.paymentMethod}
━━━━━━━━━━━━━━━━━━━
Please confirm my order and send estimated delivery time! Thank you! 🙏`;

  let rawPhone = (settings.whatsappNumber || '919345738268').replace(/\D/g, '');
  if (rawPhone.length === 10) rawPhone = '91' + rawPhone;

  const whatsappUrl = `https://wa.me/${rawPhone}?text=${encodeURIComponent(whatsappMessage)}`;

  res.status(201).json({
    success: true,
    order: newOrder,
    whatsappUrl,
    whatsappMessage,
    message: 'Order created successfully!'
  });
});

app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const orders = readJSON(ORDERS_FILE, []);
  const index = orders.findIndex(o => o.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  orders[index].status = status;
  orders[index].updatedAt = new Date().toISOString();
  writeJSON(ORDERS_FILE, orders);

  res.json({ success: true, order: orders[index], message: `Order status changed to ${status}` });
});

// 5. EXPENSES & FINANCIALS (DAILY COST VS REVENUE)
app.get('/api/finances', (req, res) => {
  const orders = readJSON(ORDERS_FILE, []);
  const expenses = readJSON(EXPENSES_FILE, []);

  const totalRevenue = orders.reduce((sum, o) => sum + (o.status !== 'Cancelled' ? o.total : 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netProfit = totalRevenue - totalExpenses;

  res.json({
    success: true,
    finances: {
      totalRevenue,
      totalExpenses,
      netProfit,
      expenses
    }
  });
});

app.post('/api/expenses', (req, res) => {
  const expenses = readJSON(EXPENSES_FILE, []);
  const newExp = {
    id: 'exp-' + Date.now(),
    date: req.body.date || new Date().toISOString().split('T')[0],
    category: req.body.category || 'General',
    description: req.body.description || 'Bakery supplies',
    amount: Number(req.body.amount) || 0
  };
  expenses.unshift(newExp);
  writeJSON(EXPENSES_FILE, expenses);
  res.status(201).json({ success: true, expense: newExp });
});

app.delete('/api/expenses/:id', (req, res) => {
  let expenses = readJSON(EXPENSES_FILE, []);
  expenses = expenses.filter(e => e.id !== req.params.id);
  writeJSON(EXPENSES_FILE, expenses);
  res.json({ success: true, message: 'Expense deleted' });
});

// 6. CUSTOMER FEEDBACK & REVIEWS
app.get('/api/feedback', (req, res) => {
  const feedback = readJSON(FEEDBACK_FILE, []);
  res.json({ success: true, feedback });
});

app.post('/api/feedback', (req, res) => {
  const feedback = readJSON(FEEDBACK_FILE, []);
  const newFb = {
    id: 'fb-' + Date.now(),
    customerName: req.body.customerName || 'Anonymous Customer',
    rating: Number(req.body.rating) || 5,
    comment: req.body.comment || '',
    date: new Date().toISOString().split('T')[0]
  };
  feedback.unshift(newFb);
  writeJSON(FEEDBACK_FILE, feedback);
  res.status(201).json({ success: true, feedback: newFb });
});

// 7. STATS & ANALYTICS
app.get('/api/stats', (req, res) => {
  const orders = readJSON(ORDERS_FILE, []);
  const products = readJSON(PRODUCTS_FILE, []);
  const expenses = readJSON(EXPENSES_FILE, []);

  const totalRevenue = orders.reduce((sum, o) => sum + (o.status !== 'Cancelled' ? o.total : 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netProfit = totalRevenue - totalExpenses;
  
  const todayStr = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => o.createdAt && o.createdAt.startsWith(todayStr));
  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.status !== 'Cancelled' ? o.total : 0), 0);

  res.json({
    success: true,
    stats: {
      totalRevenue,
      todayRevenue,
      totalOrders: orders.length,
      todayOrdersCount: todayOrders.length,
      pendingOrders: orders.filter(o => o.status === 'Pending').length,
      deliveredOrders: orders.filter(o => o.status === 'Delivered').length,
      totalProducts: products.length,
      activeProducts: products.filter(p => !p.isHidden).length,
      totalExpenses,
      netProfit
    }
  });
});

// Admin Route Fallback
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Customer Account Portal Route
app.get('/account', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'account.html'));
});

// Customer Dedicated Login / Sign In Route
app.get(['/login', '/signin'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Customer Dedicated Register / Sign Up Route
app.get(['/register', '/signup'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Customer Dedicated Wishlist Route (Exact Menagaii Reference)
app.get(['/wishlist', '/pages/wishlist', '/my-wishlist'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'wishlist.html'));
});

// Customer Dedicated Collections Route
app.get(['/collections', '/collections.html', '/pages/collections'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'collections.html'));
});

// Customer Dedicated Shopping Cart Route
app.get(['/cart', '/shopping-cart', '/bag'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cart.html'));
});

// Start Server
if (require.main === module) {
  process.stdin.resume();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=================================================`);
    console.log(`  Hill Mades Full-Stack Web App is Running!`);
    console.log(`  Customer Store: http://localhost:${PORT}`);
    console.log(`  Admin Panel:    http://localhost:${PORT}/admin`);
    console.log(`=================================================\n`);
  });
}

module.exports = app;
