# 🏔️ Ooty Hills Snacks & Chocolates — Full-Stack E-Commerce & WhatsApp Order System

A full-stack online ordering web platform for authentic Ooty snacks, homemade chocolates, Nilgiri tea, coffee, and bakery biscuits. Designed with pure Vanilla HTML5/CSS3/JavaScript (no React overhead) and a Node.js + Express backend.

---

## 🚀 Features

### 🛍️ Customer Store (`http://localhost:3000`)
1. **Appetizing Product Showcase**:
   - **Ooty Special Varkey**: 1 kg — **₹100**
   - **Ooty Homemade Chocolate**: 100 g — **₹100**
   - **Nilgiri Fresh Tea Powder (Tea Thool)**: 1 kg — **₹70**
   - **Roasted Coffee Powder (Coffee Thool)**: 1 kg — **₹70**
   - **Crispy Bakery Salt Biscuits**: 500 g (Half kg) — **₹50**
2. **Interactive Cart & Steppers**: Add to cart, adjust quantities (+/-), instant subtotal calculation.
3. **Free Delivery Meter**: Visual progress bar unlocking free delivery when order reaches ₹500.
4. **Direct WhatsApp Ordering**:
   - Customer fills delivery details (Name, Phone, Address, City, Pincode, Landmark, Payment Mode).
   - Generates unique order ID (e.g. `#OOTY-7821`) saved in backend database.
   - Automatically opens WhatsApp with a pre-filled receipt ready to send to the owner's WhatsApp number.
5. **Order Tracking**: Customers can check the live status of their order using their phone number or Order ID.

---

### ⚙️ Store Owner Admin Panel (`http://localhost:3000/admin`)
- **Protected Access**: Secure 4-digit PIN entrance (Default PIN: `1234`).
- **Live Sales Dashboard**: Total Revenue (₹), Total Orders, Pending Action, Delivered count.
- **Order Management**:
   - View all customer orders with customer name, phone, address, and items.
   - Update order status: `Pending` ➔ `Confirmed` ➔ `Preparing` ➔ `Dispatched` ➔ `Delivered` ➔ `Cancelled`.
   - **1-Click "Message Customer on WhatsApp"** button.
   - **"Print Slip"** invoice generator for order packing.
- **Product & Price Control**: Edit snack prices or toggle stock availability in real-time.
- **Store & WhatsApp Settings**:
   - **Owner WhatsApp Number**: Change the receiving WhatsApp number anytime.
   - Free delivery minimum and delivery fee settings.

---

## 🛠️ Tech Stack
- **Backend**: Node.js & Express REST API (`server.js`)
- **Database**: Persistent JSON data storage (`/data/products.json`, `/data/orders.json`, `/data/settings.json`)
- **Frontend**: Pure HTML5, Modern Vanilla CSS (`/public/css/style.css`), Modern JavaScript (`/public/js/app.js`)
- **Styling**: Tailored Nilgiris aesthetic, Google Fonts ('Outfit' & 'Plus Jakarta Sans'), glassmorphic cards, micro-interactions.

---

## 💻 How to Run
```bash
# Start the full-stack server
npm start
```
- Customer Store: [http://localhost:3000](http://localhost:3000)
- Admin Panel: [http://localhost:3000/admin](http://localhost:3000/admin) *(PIN: `1234`)*
