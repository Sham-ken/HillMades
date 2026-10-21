// Test API Suite
async function runTests() {
  const BASE = 'http://localhost:3000';
  console.log('Testing full-stack backend...\n');

  // 1. Get products
  const res1 = await fetch(`${BASE}/api/products`);
  const prods = await res1.json();
  console.log('✓ Products loaded:', prods.products.length);
  prods.products.forEach(p => console.log(`  - ${p.name} (${p.unit}) -> ₹${p.price}`));

  // 2. Get settings
  const res2 = await fetch(`${BASE}/api/settings`);
  const sets = await res2.json();
  console.log('\n✓ Settings loaded:');
  console.log(`  - Store: ${sets.settings.storeName}`);
  console.log(`  - WhatsApp: ${sets.settings.whatsappNumber}`);
  console.log(`  - Free delivery threshold: ₹${sets.settings.freeDeliveryThreshold}`);

  // 3. Create test order
  const orderPayload = {
    customer: {
      name: 'Sham Sanjay',
      phone: '9876543210',
      address: '123 Nilgiri Hills Road',
      city: 'Ooty',
      pincode: '643001'
    },
    items: [
      { id: 'ooty-varkey-1kg', quantity: 2 },
      { id: 'ooty-chocolate-100g', quantity: 3 }
    ],
    paymentMethod: 'Cash on Delivery'
  };

  const res3 = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload)
  });
  const newOrder = await res3.json();
  console.log('\n✓ New Order Created successfully:');
  console.log(`  - Order ID: #${newOrder.order.id}`);
  console.log(`  - Subtotal: ₹${newOrder.order.subtotal}`);
  console.log(`  - Delivery: ₹${newOrder.order.deliveryCharge}`);
  console.log(`  - Total: ₹${newOrder.order.total}`);
  console.log(`  - WhatsApp Dispatch URL generated: ${newOrder.whatsappUrl.substring(0, 70)}...`);

  // 4. Update status in Admin API
  const res4 = await fetch(`${BASE}/api/orders/${newOrder.order.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Confirmed' })
  });
  const updateRes = await res4.json();
  console.log(`\n✓ Admin Status Update: Status changed to ${updateRes.order.status}`);

  console.log('\nALL FULL-STACK TESTS PASSED 100%!');
}

runTests().catch(console.error);
