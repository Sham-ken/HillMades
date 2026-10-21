/**
 * OOTY HILLS SNACKS - COMPLETE STORE OWNER ADMIN SYSTEM
 * Comprehensive Shop Management:
 * 1. Dashboard & KPI Analytics
 * 2. Products & Upload Center (Only what admin uploads is shown on website!)
 * 3. Orders & WhatsApp Billing
 * 4. Customers Directory
 * 5. Expenses & Net Profit Tracker
 * 6. Feedback & Reviews
 * 7. Store & WhatsApp Configuration
 */

const adminState = {
  authenticated: false,
  authPin: '',
  orders: [],
  products: [],
  customers: [],
  expenses: [],
  feedback: [],
  settings: {},
  currentTab: 'dashboard',
  statusFilter: 'all',
  orderSearchQuery: '',
  customerSearchQuery: ''
};

// Elements
const authOverlay = document.getElementById('authOverlay');
const pinForm = document.getElementById('pinForm');
const pinInput = document.getElementById('adminPinInput');

document.addEventListener('DOMContentLoaded', () => {
  checkSessionAuth();
  setupAdminEvents();
});

// ----------------- AUTHENTICATION ----------------- //
function checkSessionAuth() {
  const savedPin = sessionStorage.getItem('ooty_admin_pin');
  if (savedPin) {
    verifyAndLogin(savedPin);
  }
}

async function verifyAndLogin(pin) {
  try {
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (data.success) {
      adminState.authenticated = true;
      adminState.authPin = pin;
      sessionStorage.setItem('ooty_admin_pin', pin);
      authOverlay.classList.add('hidden');
      loadAllAdminData();
    } else {
      alert('Incorrect Security PIN. Default is 1234');
      sessionStorage.removeItem('ooty_admin_pin');
    }
  } catch (err) {
    alert('Server communication error');
  }
}

// ----------------- DATA LOADER ----------------- //
async function loadAllAdminData() {
  await Promise.all([
    fetchStats(),
    fetchOrders(),
    fetchProducts(),
    fetchCustomers(),
    fetchFinances(),
    fetchFeedback(),
    fetchSettings()
  ]);
}

// 1. STATS & DASHBOARD
async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.success) {
      const s = data.stats;
      document.getElementById('statRevenue').textContent = `₹${s.totalRevenue}`;
      document.getElementById('statTotalOrders').textContent = s.totalOrders;
      document.getElementById('statPending').textContent = s.pendingOrders;
      document.getElementById('statExpenses').textContent = `₹${s.totalExpenses || 0}`;
      document.getElementById('statProfit').textContent = `₹${s.netProfit || 0}`;
      document.getElementById('pendingOrdersBadge').textContent = s.pendingOrders;
      document.getElementById('totalProductsBadge').textContent = s.activeProducts || s.totalProducts;
    }
  } catch (e) {
    console.error('Failed to load stats', e);
  }
}

// 2. PRODUCTS (UPLOAD CENTER & WEBSITE VISIBILITY)
async function fetchProducts() {
  try {
    const res = await fetch('/api/products?admin=true');
    const data = await res.json();
    if (data.success) {
      adminState.products = data.products;
      renderProductsTable();
      renderDashboardProductsTable();
    }
  } catch (e) {
    console.error('Failed to load products', e);
  }
}

function renderDashboardProductsTable() {
  const container = document.getElementById('dashboardProductsTableBody');
  if (!container) return;

  if (adminState.products.length === 0) {
    container.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 25px; color: #64748b;">No products uploaded yet. Click "+ Add New Item" above to publish your first snack!</td></tr>`;
    return;
  }

  container.innerHTML = adminState.products.map(p => `
    <tr>
      <td>
        <img src="${p.image}" alt="${p.name}" class="product-row-thumb" onerror="this.src='/images/varkey.jpg'" style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px;">
      </td>
      <td>
        <strong>${p.name}</strong>
        ${p.tamilName ? `<br><small style="color: #0f766e; font-weight: 600;">${p.tamilName}</small>` : ''}
      </td>
      <td><span style="background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-size: 0.78rem; font-weight: 600;">${p.category}</span></td>
      <td><strong>${p.unit}</strong></td>
      <td><strong style="color: #0b4632; font-size: 0.95rem;">₹${p.price}</strong></td>
      <td>
        <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem; font-weight: 700; color: ${!p.isHidden ? '#16a34a' : '#94a3b8'};">
          ${!p.isHidden ? '🟢 Live on Store' : '⚪ Hidden'}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <a href="/shop.html" target="_blank" class="btn-sidebar-viewstore" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 6px; text-decoration: none;">
            👁️ View on Store
          </a>
          <button type="button" class="btn-primary-action" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 6px;" onclick="switchAdminTab('products'); document.getElementById('prodName')?.focus();">
            ✏️ Manage
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderProductsTable() {
  const container = document.getElementById('adminProductsTableBody');
  if (!container) return;

  if (adminState.products.length === 0) {
    container.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 40px; color: #64748b;">No snacks in catalog yet. Click "+ Add Product" to publish your first snack!</td></tr>`;
    return;
  }

  const liveBadge = document.getElementById('catalogLiveCount');
  if (liveBadge) {
    const liveCount = adminState.products.filter(p => !p.isHidden).length;
    liveBadge.textContent = `${liveCount} Live Products`;
  }

  container.innerHTML = adminState.products.map((p, idx) => `
    <tr>
      <td style="text-align: center; font-weight: 700; color: #64748b; font-size: 0.85rem;">${idx + 1}</td>
      <td>
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="${p.image}" alt="${p.name}" class="product-row-thumb" onerror="this.src='/images/varkey.jpg'" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover; border: 1px solid #e2e8f0;">
          <div>
            <div style="font-weight: 700; color: #0f172a; font-size: 0.92rem;">${p.name}</div>
            ${p.tamilName ? `<div style="color: #0f766e; font-size: 0.78rem; font-weight: 600;">${p.tamilName}</div>` : ''}
            ${p.badge ? `<span style="font-size: 0.7rem; color: #b45309; background: #fef3c7; padding: 1px 6px; border-radius: 4px; font-weight: 700; display: inline-block; margin-top: 2px;">${p.badge}</span>` : ''}
          </div>
        </div>
      </td>
      <td>
        <span style="background: #f1f5f9; color: #334155; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; text-transform: capitalize;">${p.category}</span>
      </td>
      <td><strong style="color: #334155; font-size: 0.86rem;">${p.unit}</strong></td>
      <td>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="font-weight: 700; color: #0b4632;">₹</span>
          <input type="number" id="price-input-${p.id}" class="price-edit-input" value="${p.price}" min="1" style="width: 65px; padding: 4px 8px; font-weight: 700; font-size: 0.88rem;">
          <button type="button" class="btn-save-price" onclick="saveProductPrice('${p.id}')" title="Save new price">Save</button>
        </div>
      </td>
      <td>
        <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
          <input type="checkbox" ${!p.isHidden ? 'checked' : ''} onchange="toggleProductVisibility('${p.id}', !this.checked)">
          <span class="status-pill-it ${!p.isHidden ? 'live' : 'hidden'}">
            ${!p.isHidden ? '● Live' : '○ Hidden'}
          </span>
        </label>
      </td>
      <td>
        <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
          <input type="checkbox" ${p.inStock ? 'checked' : ''} onchange="toggleProductStock('${p.id}', this.checked)">
          <span class="status-pill-it ${p.inStock ? 'instock' : 'soldout'}">
            ${p.inStock ? 'In Stock' : 'Sold Out'}
          </span>
        </label>
      </td>
      <td style="text-align: right;">
        <div style="display: inline-flex; gap: 6px; align-items: center; justify-content: flex-end;">
          <a href="/shop.html" target="_blank" class="btn-table-icon view" title="View snack live on Customer Store">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </a>
          <button type="button" class="btn-table-icon delete" title="Delete product" onclick="deleteProduct('${p.id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

window.saveProductPrice = async (productId) => {
  const input = document.getElementById(`price-input-${productId}`);
  const newPrice = Number(input.value);
  if (!newPrice || newPrice < 1) {
    alert('Please enter a valid price');
    return;
  }

  try {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: newPrice })
    });
    const data = await res.json();
    if (data.success) {
      const prod = adminState.products.find(p => p.id === productId);
      if (prod) prod.price = newPrice;
      alert(`Updated price to ₹${newPrice}! It is now updated on the customer website.`);
    }
  } catch (err) {
    alert('Error updating price');
  }
};

window.toggleProductVisibility = async (productId, isHidden) => {
  try {
    await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isHidden })
    });
    const prod = adminState.products.find(p => p.id === productId);
    if (prod) prod.isHidden = isHidden;
    renderProductsTable();
    fetchStats();
  } catch (e) {
    alert('Failed to update visibility');
  }
};

window.toggleProductStock = async (productId, inStock) => {
  try {
    await fetch(`/api/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inStock })
    });
    const prod = adminState.products.find(p => p.id === productId);
    if (prod) prod.inStock = inStock;
    renderProductsTable();
  } catch (e) {
    alert('Failed to update stock');
  }
};

window.deleteProduct = async (productId) => {
  if (!confirm('Are you sure you want to delete this snack from the store?')) return;
  try {
    const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      adminState.products = adminState.products.filter(p => p.id !== productId);
      renderProductsTable();
      fetchStats();
    }
  } catch (e) {
    alert('Failed to delete product');
  }
};

// 3. ORDERS & BILLING
async function fetchOrders() {
  try {
    const res = await fetch('/api/orders');
    const data = await res.json();
    if (data.success) {
      adminState.orders = data.orders;
      renderOrders();
      renderDashboardRecentOrders();
    }
  } catch (e) {
    console.error('Failed to load orders', e);
  }
}

function renderOrders() {
  const container = document.getElementById('adminOrdersList');
  if (!container) return;

  const filtered = adminState.orders.filter(ord => {
    const matchStatus = adminState.statusFilter === 'all' || ord.status === adminState.statusFilter;
    const q = adminState.orderSearchQuery.toLowerCase();
    const matchSearch = q === '' ||
      ord.id.toLowerCase().includes(q) ||
      (ord.customer && ord.customer.name && ord.customer.name.toLowerCase().includes(q)) ||
      (ord.customer && ord.customer.phone && ord.customer.phone.includes(q));
    return matchStatus && matchSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 50px 20px; background: white; border-radius: 12px; border: 1px dashed #cbd5e1;">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">📦</div>
        <h4 style="color: #0f172a; margin-bottom: 4px;">No orders found</h4>
        <p style="color: #64748b; font-size: 0.88rem;">No orders match the selected filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(order => createOrderCardHtml(order)).join('');
}

function renderDashboardRecentOrders() {
  const container = document.getElementById('dashboardRecentOrders');
  if (!container) return;

  const recent = adminState.orders.slice(0, 3);
  if (recent.length === 0) {
    container.innerHTML = `<p style="color: #64748b; font-size: 0.9rem;">No orders placed yet.</p>`;
    return;
  }
  container.innerHTML = recent.map(order => createOrderCardHtml(order)).join('');
}

function createOrderCardHtml(order) {
  const dateFormatted = new Date(order.createdAt).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let rawCustPhone = (order.customer.phone || '').replace(/\D/g, '');
  if (rawCustPhone.length === 10) rawCustPhone = '91' + rawCustPhone;
  const custChatMsg = encodeURIComponent(`Hello ${order.customer.name}! This is from Ooty Hills Snacks regarding your order #${order.id}.`);
  const custWhatsAppUrl = `https://wa.me/${rawCustPhone}?text=${custChatMsg}`;

  return `
    <div class="order-box" id="order-card-${order.id}">
      <div class="order-box-header">
        <div class="order-id-group">
          <h4>Order #${order.id}</h4>
          <span>Placed on: ${dateFormatted}</span>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="order-status-badge" style="background: ${getStatusBadgeBg(order.status)}; color: ${getStatusBadgeText(order.status)};">
            ${order.status}
          </span>
        </div>
      </div>

      <div class="order-box-grid">
        <div class="cust-card">
          <h5>Customer Info</h5>
          <div class="cust-name">${order.customer.name}</div>
          <div class="cust-phone">📞 ${order.customer.phone}</div>
          <div class="cust-address">
            📍 ${order.customer.address}, ${order.customer.city}
            ${order.customer.pincode ? ` - ${order.customer.pincode}` : ''}
            ${order.customer.landmark ? `<br><small><strong>Landmark:</strong> ${order.customer.landmark}</small>` : ''}
            ${order.customer.notes ? `<br><small style="color: #b45309;"><strong>Note:</strong> ${order.customer.notes}</small>` : ''}
          </div>
        </div>

        <div class="items-card">
          <h5>Ordered Items (${order.items.length})</h5>
          <table class="order-items-table">
            <tbody>
              ${order.items.map(it => `
                <tr>
                  <td><strong>${it.name}</strong> (${it.unit})</td>
                  <td style="color: #64748b; padding: 0 10px;">x ${it.quantity}</td>
                  <td>₹${it.total}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="summary-card">
          <h5>Billing Summary</h5>
          <div style="font-size: 0.85rem; color: #64748b; margin-bottom: 4px;">
            Subtotal: <strong>₹${order.subtotal}</strong>
          </div>
          <div style="font-size: 0.85rem; color: #64748b; margin-bottom: 4px;">
            Delivery: <strong>${order.deliveryCharge === 0 ? 'FREE' : '₹' + order.deliveryCharge}</strong>
          </div>
          <div style="font-size: 1.15rem; font-weight: 800; color: #0b4632; margin: 6px 0;">
            Total: ₹${order.total}
          </div>
          <div style="font-size: 0.82rem; font-weight: 600; color: #047857; background: #ecfdf5; padding: 4px 8px; border-radius: 4px; display: inline-block;">
            Payment: ${order.paymentMethod}
          </div>
        </div>
      </div>

      <div class="order-box-footer">
        <div class="status-change-control">
          <span style="font-size: 0.85rem; font-weight: 700;">Update Status:</span>
          <select class="status-select" onchange="updateOrderStatus('${order.id}', this.value)">
            <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
            <option value="Confirmed" ${order.status === 'Confirmed' ? 'selected' : ''}>✓ Confirmed</option>
            <option value="Preparing" ${order.status === 'Preparing' ? 'selected' : ''}>👨‍🍳 Preparing</option>
            <option value="Dispatched" ${order.status === 'Dispatched' ? 'selected' : ''}>🚚 Dispatched</option>
            <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>🎉 Delivered</option>
            <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>✕ Cancelled</option>
          </select>
        </div>

        <div style="display: flex; gap: 8px;">
          <a href="${custWhatsAppUrl}" target="_blank" class="btn-whatsapp-chat">
            <span>💬</span> Message Customer on WhatsApp
          </a>
          <button type="button" class="btn-sidebar-store" style="color: #0f172a; border: 1px solid #cbd5e1; background: #f8fafc;" onclick="printOrderInvoice('${order.id}')">
            🖨️ Print Slip
          </button>
        </div>
      </div>
    </div>
  `;
}

function getStatusBadgeBg(status) {
  switch (status) {
    case 'Pending': return '#fef3c7';
    case 'Confirmed': return '#dbeafe';
    case 'Preparing': return '#ede9fe';
    case 'Dispatched': return '#cffafe';
    case 'Delivered': return '#dcfce7';
    case 'Cancelled': return '#fee2e2';
    default: return '#f1f5f9';
  }
}

function getStatusBadgeText(status) {
  switch (status) {
    case 'Pending': return '#92400e';
    case 'Confirmed': return '#1e40af';
    case 'Preparing': return '#5b21b6';
    case 'Dispatched': return '#155e75';
    case 'Delivered': return '#166534';
    case 'Cancelled': return '#991b1b';
    default: return '#475569';
  }
}

window.updateOrderStatus = async (orderId, newStatus) => {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      const ord = adminState.orders.find(o => o.id === orderId);
      if (ord) ord.status = newStatus;
      renderOrders();
      renderDashboardRecentOrders();
      fetchStats();
    } else {
      alert(data.message || 'Status update failed');
    }
  } catch (err) {
    alert('Failed to connect to server');
  }
};

window.printOrderInvoice = (orderId) => {
  const order = adminState.orders.find(o => o.id === orderId);
  if (!order) return;

  const printWindow = window.open('', '_blank', 'width=650,height=750');
  printWindow.document.write(`
    <html>
      <head>
        <title>Invoice - ${order.id}</title>
        <style>
          body { font-family: sans-serif; padding: 25px; line-height: 1.5; color: #1e293b; }
          .header { text-align: center; border-bottom: 2px dashed #94a3b8; padding-bottom: 15px; margin-bottom: 15px; }
          .title { font-size: 22px; font-weight: bold; color: #0b4632; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
          th { background: #f8fafc; font-size: 13px; }
          .total { font-size: 18px; font-weight: bold; color: #0b4632; text-align: right; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">OOTY HILLS SNACKS & CHOCOLATES</div>
          <div>100% Online Store • Fresh Dispatch from Ooty, Nilgiris</div>
          <div>WhatsApp / Contact: ${adminState.settings.whatsappNumber || '919345738268'}</div>
          <div style="margin-top: 8px; font-weight: bold;">PACKING SLIP & BILL #${order.id}</div>
          <div>${new Date(order.createdAt).toLocaleString()}</div>
        </div>

        <div>
          <strong>Customer:</strong> ${order.customer.name} (Ph: ${order.customer.phone})<br>
          <strong>Address:</strong> ${order.customer.address}, ${order.customer.city} - ${order.customer.pincode || ''}<br>
          <strong>Payment Mode:</strong> ${order.paymentMethod}
        </div>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Unit</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map(it => `
              <tr>
                <td>${it.name}</td>
                <td>${it.unit}</td>
                <td>${it.quantity}</td>
                <td>₹${it.price}</td>
                <td>₹${it.total}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="text-align: right; margin-top: 10px;">
          <div>Subtotal: ₹${order.subtotal}</div>
          <div>Delivery: ${order.deliveryCharge === 0 ? 'FREE' : '₹' + order.deliveryCharge}</div>
          <div class="total">GRAND TOTAL: ₹${order.total}</div>
        </div>

        <div style="text-align: center; margin-top: 35px; border-top: 1px dashed #cbd5e1; padding-top: 15px; font-size: 13px;">
          Thank you for choosing Authentic Ooty Nilgiri Treats! Freshly Packed with Care.
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
};

// 4. CUSTOMERS DIRECTORY
async function fetchCustomers() {
  try {
    const res = await fetch('/api/customers');
    const data = await res.json();
    if (data.success) {
      adminState.customers = data.customers;
      document.getElementById('statTotalCustomers').textContent = data.customers.length;
      renderCustomersTable();
    }
  } catch (e) {
    console.error('Failed to load customers', e);
  }
}

function renderCustomersTable() {
  const container = document.getElementById('customersTableBody');
  if (!container) return;

  const q = adminState.customerSearchQuery.toLowerCase();
  const filtered = adminState.customers.filter(c => 
    c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.address.toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    container.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 25px;">No customers found.</td></tr>`;
    return;
  }

  container.innerHTML = filtered.map(c => {
    let cleanP = c.phone.replace(/\D/g, '');
    if (cleanP.length === 10) cleanP = '91' + cleanP;
    const waUrl = `https://wa.me/${cleanP}?text=${encodeURIComponent('Hello ' + c.name + '! Greeting from Ooty Hills Snacks.')}`;

    return `
      <tr>
        <td><strong>#${c.id}</strong></td>
        <td><strong>${c.name}</strong></td>
        <td>📞 ${c.phone}</td>
        <td style="max-width: 250px; font-size: 0.85rem; color: #475569;">${c.address}, ${c.city}</td>
        <td><span style="background: #e0f2fe; color: #0369a1; font-weight: 700; padding: 3px 8px; border-radius: 999px;">${c.totalOrders} orders</span></td>
        <td><strong style="color: #0b4632; font-size: 1rem;">₹${c.totalSpent}</strong></td>
        <td>
          <a href="${waUrl}" target="_blank" class="btn-whatsapp-chat" style="padding: 5px 12px; font-size: 0.8rem;">
            💬 WhatsApp
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

// 5. FINANCES & EXPENSES
async function fetchFinances() {
  try {
    const res = await fetch('/api/finances');
    const data = await res.json();
    if (data.success) {
      adminState.expenses = data.finances.expenses;
      renderExpensesTable();
    }
  } catch (e) {
    console.error('Failed to load finances', e);
  }
}

function renderExpensesTable() {
  const container = document.getElementById('expensesTableBody');
  if (!container) return;

  if (adminState.expenses.length === 0) {
    container.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">No expenses recorded yet.</td></tr>`;
    return;
  }

  container.innerHTML = adminState.expenses.map(e => `
    <tr>
      <td>${e.date}</td>
      <td><span style="background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-weight: 600; font-size: 0.82rem;">${e.category}</span></td>
      <td>${e.description}</td>
      <td><strong style="color: #dc2626;">₹${e.amount}</strong></td>
      <td>
        <button type="button" class="btn-admin-logout" style="padding: 3px 8px; font-size: 0.75rem;" onclick="deleteExpense('${e.id}')">
          ✕ Delete
        </button>
      </td>
    </tr>
  `).join('');
}

window.deleteExpense = async (id) => {
  if (!confirm('Delete this expense entry?')) return;
  try {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      adminState.expenses = adminState.expenses.filter(e => e.id !== id);
      renderExpensesTable();
      fetchStats();
    }
  } catch (e) {
    alert('Failed to delete expense');
  }
};

// 6. FEEDBACK & REVIEWS
async function fetchFeedback() {
  try {
    const res = await fetch('/api/feedback');
    const data = await res.json();
    if (data.success) {
      adminState.feedback = data.feedback;
      renderFeedback();
    }
  } catch (e) {
    console.error('Failed to load feedback', e);
  }
}

function renderFeedback() {
  const container = document.getElementById('feedbackContainer');
  if (!container) return;

  container.innerHTML = adminState.feedback.map(fb => `
    <div style="background: white; border: 1px solid var(--admin-border); border-radius: 12px; padding: 16px; box-shadow: var(--shadow);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="color: #0b4632; font-size: 1rem;">${fb.customerName}</strong>
        <span style="color: #d97706; font-size: 0.9rem;">${'⭐'.repeat(fb.rating)}</span>
      </div>
      <p style="font-size: 0.88rem; color: #475569; line-height: 1.45; margin-bottom: 8px;">"${fb.comment}"</p>
      <div style="font-size: 0.75rem; color: #94a3b8;">${fb.date}</div>
    </div>
  `).join('');
}

// 7. SETTINGS
async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      adminState.settings = data.settings;
      renderSettingsForm();
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
}

function renderSettingsForm() {
  const numInput = document.getElementById('settingWhatsappNumber');
  const nameInput = document.getElementById('settingStoreName');
  const thresholdInput = document.getElementById('settingFreeDeliveryThreshold');
  const chargeInput = document.getElementById('settingDeliveryCharge');
  const fast2smsInput = document.getElementById('settingFast2smsApiKey');
  const statusBadge = document.getElementById('fast2smsStatusBadge');

  if (numInput) numInput.value = adminState.settings.whatsappNumber || '';
  if (nameInput) nameInput.value = adminState.settings.storeName || '';
  if (thresholdInput) thresholdInput.value = adminState.settings.freeDeliveryThreshold || 500;
  if (chargeInput) chargeInput.value = adminState.settings.standardDeliveryCharge || 40;

  const currentKey = adminState.settings.fast2smsApiKey || '';
  if (fast2smsInput) fast2smsInput.value = currentKey;
  if (statusBadge) {
    if (currentKey.trim()) {
      statusBadge.textContent = '🟢 Cellular SMS Active';
      statusBadge.style.background = '#dcfce7';
      statusBadge.style.color = '#166534';
    } else {
      statusBadge.textContent = 'WhatsApp Gateway Active';
      statusBadge.style.background = '#e2e8f0';
      statusBadge.style.color = '#475569';
    }
  }
}

// ----------------- EVENT LISTENERS ----------------- //
function setupAdminEvents() {
  // Login PIN
  if (pinForm) {
    pinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const entered = pinInput.value.trim();
      verifyAndLogin(entered);
    });
  }

  // Logout
  const logoutBtn = document.getElementById('btnAdminLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('ooty_admin_pin');
      window.location.reload();
    });
  }

  // Tab Switching
  window.switchAdminTab = (tabTarget) => {
    const navItems = document.querySelectorAll('.admin-sidebar .nav-item');
    navItems.forEach(n => {
      if (n.getAttribute('data-tab') === tabTarget) {
        n.classList.add('active');
      } else {
        n.classList.remove('active');
      }
    });

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const activeTab = document.getElementById(`tab-${tabTarget}`);
    if (activeTab) activeTab.classList.add('active');

    // Update Topbar Breadcrumb
    const titles = {
      dashboard: 'Dashboard Overview',
      products: 'Products Catalog',
      'add-product': 'Products / Add New Product',
      orders: 'Orders & Fulfillment',
      customers: 'Customer Directory',
      finances: 'Expenses & Net Profit',
      feedback: 'Customer Reviews',
      settings: 'Store & WhatsApp Settings'
    };
    const breadcrumbEl = document.getElementById('topbarBreadcrumb') || document.getElementById('topbarTitle');
    if (breadcrumbEl) breadcrumbEl.textContent = titles[tabTarget] || 'Dashboard';

    // Smooth scroll to top of workspace
    const workspace = document.querySelector('.admin-workspace');
    if (workspace) workspace.scrollTop = 0;
  };

  const navItems = document.querySelectorAll('.admin-sidebar .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabTarget = item.getAttribute('data-tab');
      window.switchAdminTab(tabTarget);
    });
  });

  // Upload Product Form
  const addProductForm = document.getElementById('addProductForm');
  if (addProductForm) {
    addProductForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnUploadProduct');
      btn.disabled = true;
      btn.innerHTML = `<span>⏳</span> Adding to Catalog & Publishing...`;

      const formData = new FormData(addProductForm);

      try {
        const res = await fetch('/api/products', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          alert(`🎉 Success! "${data.product.name}" has been published to your store.\n\nNow redirecting to the front store page to see your live product!`);
          // Redirect directly to customer front store page
          window.location.href = `/shop.html?added=${encodeURIComponent(data.product.name)}`;
        } else {
          alert(data.message || 'Failed to upload product');
        }
      } catch (err) {
        alert('Server communication error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>🚀</span> Add Product & Go to Front Page`;
      }
    });
  }

  // Add Expense Form
  const addExpenseForm = document.getElementById('addExpenseForm');
  if (addExpenseForm) {
    addExpenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const expData = {
        category: document.getElementById('expCategory').value,
        description: document.getElementById('expDesc').value.trim(),
        amount: Number(document.getElementById('expAmount').value)
      };

      try {
        const res = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(expData)
        });
        const data = await res.json();
        if (data.success) {
          addExpenseForm.reset();
          fetchFinances();
          fetchStats();
        }
      } catch (err) {
        alert('Failed to record expense');
      }
    });
  }

  // Save Settings Form
  const settingsForm = document.getElementById('adminSettingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPin = document.getElementById('settingAdminPin').value.trim();
      const updatedData = {
        authPin: adminState.authPin,
        whatsappNumber: document.getElementById('settingWhatsappNumber').value.trim(),
        storeName: document.getElementById('settingStoreName').value.trim(),
        freeDeliveryThreshold: Number(document.getElementById('settingFreeDeliveryThreshold').value) || 500,
        standardDeliveryCharge: Number(document.getElementById('settingDeliveryCharge').value) || 40,
        fast2smsApiKey: (document.getElementById('settingFast2smsApiKey')?.value || '').trim()
      };

      if (newPin) {
        updatedData.adminPin = newPin;
      }

      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedData)
        });
        const data = await res.json();
        if (data.success) {
          alert('Store settings, WhatsApp Number & SMS Gateway saved successfully!');
          adminState.settings = data.settings;
          renderSettingsForm();
          if (newPin) {
            adminState.authPin = newPin;
            sessionStorage.setItem('ooty_admin_pin', newPin);
          }
        } else {
          alert(data.message || 'Failed to save settings');
        }
      } catch (err) {
        alert('Server error saving settings');
      }
    });

  // Test SMS Dispatch Handler
  window.handleTestSms = async () => {
    const phoneInput = document.getElementById('testSmsPhone');
    const feedback = document.getElementById('testSmsFeedback');
    const btn = document.getElementById('btnTestSms');
    const rawPhone = phoneInput ? phoneInput.value.replace(/\D/g, '').slice(-10) : '';

    if (!rawPhone || rawPhone.length !== 10) {
      if (feedback) {
        feedback.textContent = '❌ Please enter a valid 10-digit mobile number';
        feedback.style.color = '#ef4444';
      }
      phoneInput?.focus();
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending...';
    }
    if (feedback) {
      feedback.textContent = 'Dispatching test SMS via Fast2SMS...';
      feedback.style.color = '#2563eb';
    }

    try {
      const res = await fetch('/api/admin/test-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: rawPhone,
          authPin: adminState.authPin
        })
      });
      const data = await res.json();
      if (data.success) {
        if (feedback) {
          feedback.textContent = `✓ ${data.message}`;
          feedback.style.color = '#16a34a';
        }
      } else {
        if (feedback) {
          feedback.textContent = `✕ ${data.message || 'SMS failed'}`;
          feedback.style.color = '#dc2626';
        }
      }
    } catch (err) {
      if (feedback) {
        feedback.textContent = '✕ Network error while testing SMS';
        feedback.style.color = '#dc2626';
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send Test SMS 📲';
      }
    }
  };
  }

  // Orders Status Filter Pills
  const statusPills = document.querySelectorAll('.status-pill-btn');
  statusPills.forEach(pill => {
    pill.addEventListener('click', () => {
      statusPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      adminState.statusFilter = pill.getAttribute('data-status');
      renderOrders();
    });
  });

  // Orders Search
  const orderSearchInput = document.getElementById('orderSearchInput');
  if (orderSearchInput) {
    orderSearchInput.addEventListener('input', (e) => {
      adminState.orderSearchQuery = e.target.value.trim();
      renderOrders();
    });
  }

  // Customers Search
  const custSearchInput = document.getElementById('customerSearchInput');
  if (custSearchInput) {
    custSearchInput.addEventListener('input', (e) => {
      adminState.customerSearchQuery = e.target.value.trim();
      renderCustomersTable();
    });
  }
}
