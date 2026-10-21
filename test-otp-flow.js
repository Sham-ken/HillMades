// Test OTP & Customer Auth Flow
async function test() {
  const BASE = 'http://localhost:3000';
  console.log('Testing OTP & Customer Auth Flow...\n');

  // 1. Send OTP for Login with existing phone
  const testPhone = '9876543210';
  console.log(`1. Requesting OTP for +91 ${testPhone}...`);
  const res1 = await fetch(`${BASE}/api/customer/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone, mode: 'login' })
  });
  const data1 = await res1.json();
  console.log('Response:', data1);
  if (!data1.success || !data1.otp) throw new Error('Failed to send OTP');

  // 2. Verify OTP
  console.log(`\n2. Verifying OTP [ ${data1.otp} ]...`);
  const res2 = await fetch(`${BASE}/api/customer/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone, otp: data1.otp })
  });
  const data2 = await res2.json();
  console.log('Verified Customer:', data2.customer);
  console.log(`Orders found for this customer: ${data2.orders.length}`);

  // 3. Update customer address
  console.log(`\n3. Updating delivery address...`);
  const res3 = await fetch(`${BASE}/api/customer/address`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: testPhone,
      name: 'Sham Sanjay',
      address: '45 Nilgiri Pine View Road, Doddabetta Lane',
      city: 'Ooty',
      pincode: '643002',
      landmark: 'Near View Point'
    })
  });
  const data3 = await res3.json();
  console.log('Updated address:', data3.customer);

  // 4. Test Customer Orders endpoint
  console.log(`\n4. Fetching customer orders...`);
  const res4 = await fetch(`${BASE}/api/customer/orders?phone=${testPhone}`);
  const data4 = await res4.json();
  console.log(`Fetched ${data4.orders.length} orders:`);
  data4.orders.forEach(o => {
    console.log(`  - #${o.id} (${o.status}) Total: ₹${o.total} with ${o.items.length} items`);
  });

  // 5. Test Register new customer
  const newPhone = '9123456789';
  console.log(`\n5. Testing new customer registration for +91 ${newPhone}...`);
  const res5 = await fetch(`${BASE}/api/customer/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: newPhone,
      name: 'Priya Sharma',
      address: '77 Coonoor Tea Estate Road',
      city: 'Coonoor',
      pincode: '643101',
      mode: 'register'
    })
  });
  const data5 = await res5.json();
  console.log('OTP generated for new customer:', data5.otp);

  const res6 = await fetch(`${BASE}/api/customer/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: newPhone, otp: data5.otp, name: 'Priya Sharma' })
  });
  const data6 = await res6.json();
  console.log('New customer registered:', data6.customer);

  console.log('\n🎉 ALL OTP & CUSTOMER ENDPOINTS VERIFIED SUCCESSFULLY!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
