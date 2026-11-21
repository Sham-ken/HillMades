/**
 * OOTY HILLS - CLIENT STORE ENGINE
 * Pure Vanilla JS, Shared across Home and Shop pages
 */

const storeState = {
  products: [],
  cart: [],
  wishlist: [],
  customer: (function() {
    try {
      return JSON.parse(localStorage.getItem('ooty_customer') || 'null');
    } catch (e) {
      return null;
    }
  })(),
  activeCategory: 'all',
  selectedCategories: new Set(),
  selectedTypes: new Set(),
  filterSearch: '',
  priceMin: 0,
  priceMax: 9999,
  sortBy: 'featured',
  settings: {
    freeDeliveryThreshold: 500,
    standardDeliveryCharge: 40,
    whatsappNumber: '919514292383'
  }
};

// =========================================================
// CUSTOMER-SCOPED CART & WISHLIST STORAGE ENGINE
// Ensures each logged-in phone number gets its own isolated
// cart and wishlist. Logging out or switching numbers never
// shows another customer's items!
// =========================================================
function getCustomerStorageScope() {
  const cust = (typeof storeState !== 'undefined' && storeState.customer)
    ? storeState.customer
    : (function() {
        try {
          return JSON.parse(localStorage.getItem('ooty_customer') || 'null');
        } catch (e) {
          return null;
        }
      })();
  if (cust && cust.phone) {
    const cleanPhone = String(cust.phone).replace(/\D/g, '').slice(-10);
    if (cleanPhone.length === 10) return cleanPhone;
  }
  return 'guest';
}

function getCartStorageKey() {
  const scope = getCustomerStorageScope();
  return scope === 'guest' ? 'ooty_cart_guest' : `ooty_cart_${scope}`;
}

function getWishlistStorageKey() {
  const scope = getCustomerStorageScope();
  return scope === 'guest' ? 'ooty_wishlist_guest' : `ooty_wishlist_${scope}`;
}

function saveCartToStorage() {
  const scope = getCustomerStorageScope();
  const key = getCartStorageKey();
  const data = JSON.stringify(storeState.cart || []);
  localStorage.setItem(key, data);
  localStorage.setItem(`ooty_luxury_cart_${scope}`, data);
  if (scope === 'guest') {
    localStorage.setItem('ooty_cart', data);
    localStorage.setItem('ooty_luxury_cart', data);
  }
}
window.saveCartToStorage = saveCartToStorage;

function loadCartFromStorage() {
  try {
    const scope = getCustomerStorageScope();
    const key = getCartStorageKey();
    let s = localStorage.getItem(key) || localStorage.getItem(`ooty_luxury_cart_${scope}`);
    
    // One-time migration: If this user's key is not yet set, check legacy un-scoped key
    if (!s) {
      const legacy = localStorage.getItem('ooty_luxury_cart') || localStorage.getItem('ooty_cart');
      if (legacy) {
        s = legacy;
        // If logged in, migrate into user's own scoped key & clear legacy to prevent leakage to other users
        if (scope !== 'guest') {
          localStorage.setItem(key, legacy);
          localStorage.setItem(`ooty_luxury_cart_${scope}`, legacy);
          localStorage.removeItem('ooty_luxury_cart');
          localStorage.removeItem('ooty_cart');
        }
      }
    }
    
    storeState.cart = s ? JSON.parse(s) : [];
  } catch (e) {
    storeState.cart = [];
  }
}
window.loadCartFromStorage = loadCartFromStorage;

function saveWishlistToStorage() {
  const scope = getCustomerStorageScope();
  const key = getWishlistStorageKey();
  const data = JSON.stringify(storeState.wishlist || []);
  localStorage.setItem(key, data);
  if (scope === 'guest') {
    localStorage.setItem('ooty_wishlist', data);
  }
}
window.saveWishlistToStorage = saveWishlistToStorage;

function loadWishlistFromStorage() {
  try {
    const scope = getCustomerStorageScope();
    const key = getWishlistStorageKey();
    let s = localStorage.getItem(key);
    
    // One-time migration: If this user's key is not yet set, check legacy un-scoped key
    if (!s) {
      const legacy = localStorage.getItem('ooty_wishlist');
      if (legacy) {
        s = legacy;
        if (scope !== 'guest') {
          localStorage.setItem(key, legacy);
          localStorage.removeItem('ooty_wishlist');
        }
      }
    }
    
    storeState.wishlist = s ? JSON.parse(s) : [];
  } catch (e) {
    storeState.wishlist = [];
  }
}
window.loadWishlistFromStorage = loadWishlistFromStorage;

window.switchCustomerSession = function(customerOrNull) {
  // 1. Save current session data to its own key before switching
  saveCartToStorage();
  saveWishlistToStorage();

  // 2. Set new customer
  storeState.customer = customerOrNull;
  if (customerOrNull) {
    localStorage.setItem('ooty_customer', JSON.stringify(customerOrNull));
  } else {
    localStorage.removeItem('ooty_customer');
  }

  // 3. Load the new customer's isolated cart & wishlist!
  loadCartFromStorage();
  loadWishlistFromStorage();

  // 4. Clean orphan items & refresh all UI
  cleanOrphanedStorageItems();
  updateCustomerAccountUI();
  renderCart();
  updateWishlistUI();
  if (typeof renderDedicatedCartPage === 'function') {
    renderDedicatedCartPage();
  }
  if (typeof renderDedicatedWishlistPage === 'function') {
    renderDedicatedWishlistPage();
  }
};

// Elements
const cartBadge = document.getElementById('cartBadgeCount');
const wishlistBadge = document.getElementById('wishlistBadgeCount');
const cartDrawer = document.getElementById('cartDrawer');
const cartBackdrop = document.getElementById('cartBackdrop');
const cartItemsContainer = document.getElementById('cartItemsContainer');
const cartSubtotalEl = document.getElementById('cartSubtotal');
const cartDeliveryEl = document.getElementById('cartDelivery');
const cartTotalEl = document.getElementById('cartTotal');

// Modals
const checkoutModal = document.getElementById('checkoutModal');
const accountModal = document.getElementById('accountModal');
const searchModal = document.getElementById('searchModal');
const wishlistModal = document.getElementById('wishlistModal');
const customerAuthModal = document.getElementById('customerAuthModal');
const customerAddressModal = document.getElementById('customerAddressModal');
const accountDropdownCard = document.getElementById('accountDropdownCard');

document.addEventListener('DOMContentLoaded', async () => {
  loadCartFromStorage();
  loadWishlistFromStorage();
  await loadSettings();
  await loadProducts();
  cleanOrphanedStorageItems();
  setupUIEvents();
  renderCart();
  updateWishlistUI();
  if (typeof renderDedicatedWishlistPage === 'function') {
    renderDedicatedWishlistPage();
  }
  if (typeof renderDedicatedCartPage === 'function') {
    renderDedicatedCartPage();
  }
  updateCustomerAccountUI();
  checkUrlCategory();
});

// Synchronize stored cart & wishlist with active products catalog
function cleanOrphanedStorageItems() {
  if (!storeState.products || storeState.products.length === 0) return;
  const validIds = new Set(storeState.products.map(p => p.id));

  // 1. Clean Wishlist (remove any stale IDs from removed items)
  if (Array.isArray(storeState.wishlist)) {
    const origWishLen = storeState.wishlist.length;
    storeState.wishlist = storeState.wishlist.filter(id => validIds.has(id));
    if (storeState.wishlist.length !== origWishLen) {
      saveWishlistToStorage();
    }
  }

  // 2. Clean Cart
  if (Array.isArray(storeState.cart)) {
    const origCartLen = storeState.cart.length;
    storeState.cart = storeState.cart.filter(item => validIds.has(item.id));
    if (storeState.cart.length !== origCartLen) {
      saveCartToStorage();
    }
  }
}

// Load settings
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      storeState.settings = { ...storeState.settings, ...data.settings };
    }
  } catch (e) {}
}

// Load products from Server (ONLY active items uploaded by admin)
async function loadProducts() {
  try {
    const [prodRes, catRes] = await Promise.all([
      fetch('/api/products').then(r => r.json()).catch(() => ({ success: false })),
      fetch('/api/categories').then(r => r.json()).catch(() => ({ success: false }))
    ]);

    if (prodRes && prodRes.success) {
      storeState.products = prodRes.products;
    }
    if (catRes && catRes.success) {
      storeState.serverCategories = catRes.categories;
    }

    // Dynamically derive current category & variety structure from live products & server categories
    refreshDynamicCategoryStructure();

    // Clean any orphan wishlist/cart entries from past sessions
    cleanOrphanedStorageItems();

    // Populate all components dynamically
    renderDynamicHeaderCollections();
    renderDynamicCollectionsPage();
    ensureMobileCollectionsUI();
    ensureFloatingWhatsAppWidget();
    setupUniversalWhatsAppInterceptor();

    if (typeof initShopFilters === 'function') {
      initShopFilters();
    }
    renderProductsOnPages();
    updateWishlistUI();
    if (typeof renderDedicatedWishlistPage === 'function') {
      renderDedicatedWishlistPage();
    }
    if (typeof renderDedicatedCartPage === 'function') {
      renderDedicatedCartPage();
    }
    checkNewProductAddedNotification();
  } catch (e) {
    console.error('Failed to load products', e);
  }
}

// Celebration Toast Banner when navigating from Admin Panel after adding an item
function checkNewProductAddedNotification() {
  const urlParams = new URLSearchParams(window.location.search);
  const addedItemName = urlParams.get('added');
  if (!addedItemName) return;

  let toast = document.getElementById('newProductPublishedBanner');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'newProductPublishedBanner';
    toast.style.cssText = `
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #0f172a;
      color: #ffffff;
      padding: 16px 24px;
      border-radius: 14px;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35), 0 0 0 2px #38bdf8;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 14px;
      max-width: 90%;
      animation: bounceInDown 0.4s ease-out;
    `;
    toast.innerHTML = `
      <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #059669, #10b981); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; flex-shrink: 0;">
        🎉
      </div>
      <div>
        <div style="font-size: 0.76rem; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.6px;">
          Product Published Live
        </div>
        <div style="font-size: 1rem; font-weight: 700; color: #ffffff;">
          "${addedItemName}" is now live on the store front page!
        </div>
        <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 2px;">
          Customers can now view, add to bag, and order via WhatsApp.
        </div>
      </div>
      <button type="button" style="background: none; border: none; color: #94a3b8; font-size: 1.2rem; cursor: pointer; padding: 4px 8px; margin-left: 10px;" onclick="this.parentElement.remove()">
        ✕
      </button>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast) toast.remove();
    }, 10000);
  }
}

// Dynamic Categories & Varieties Structure (100% dynamic from uploaded products)
let categoryStructure = [];

function refreshDynamicCategoryStructure() {
  const catMap = new Map();

  // Populate categories ONLY from active products uploaded by admin!
  if (Array.isArray(storeState.products) && storeState.products.length > 0) {
    storeState.products.forEach(p => {
      if (!p) return;
      const rawCat = (p.category || 'general').trim();
      const slug = rawCat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const catName = p.categoryName || (rawCat.charAt(0).toUpperCase() + rawCat.slice(1));

      if (!catMap.has(slug)) {
        catMap.set(slug, {
          category: slug,
          name: catName,
          badge: p.badge || 'Hill Made Specialty',
          description: p.description || `Freshly prepared Nilgiri ${catName} specialty. Handcrafted with authentic mountain recipes.`,
          image: p.image || '/images/varkey-square.jpg',
          types: [],
          startingPrice: Number(p.price) || 0,
          productCount: 0
        });
      }

      const catObj = catMap.get(slug);
      catObj.productCount += 1;
      const price = Number(p.price);
      if (price && (!catObj.startingPrice || price < catObj.startingPrice)) {
        catObj.startingPrice = price;
      }
      if (p.image) {
        catObj.image = p.image;
      }
      if (p.type && p.type.trim()) {
        const t = p.type.trim();
        if (!catObj.types.includes(t)) {
          catObj.types.push(t);
        }
      }
    });
  }

  // Build the dynamic categoryStructure
  categoryStructure = Array.from(catMap.values());
  storeState.dynamicCategories = categoryStructure;
}

// Dynamic Header Collections Dropdown Renderer (Across all pages)
function renderDynamicHeaderCollections() {
  const wrappers = document.querySelectorAll('.collections-dropdown-wrapper');
  if (wrappers.length > 0) {
    wrappers.forEach(wrapper => {
      if (categoryStructure.length === 0) {
        wrapper.innerHTML = `
          <div style="padding: 24px 18px; text-align: center; color: #64748b; font-size: 0.88rem; line-height: 1.5;">
            Fresh collections arriving soon.<br>
            <span style="font-size: 0.78rem; color: #94a3b8;">Handcrafted Nilgiris delicacies prepared fresh in hill bakeries.</span>
          </div>
        `;
        return;
      }

      // Card 1: Left Categories
      let primaryHtml = '<div class="collections-primary-card">';
      categoryStructure.forEach((cat, idx) => {
        const isActive = idx === 0 ? 'active' : '';
        primaryHtml += `
          <a href="/shop.html?cat=${encodeURIComponent(cat.category)}" class="collections-primary-link ${isActive}" data-cat="${cat.category}">
            <span>${cat.name}</span>
          </a>
        `;
      });
      primaryHtml += '</div>';

      // Card 2: Right Sub-Items
      let secondaryHtml = '';
      categoryStructure.forEach((cat, idx) => {
        const isActive = idx === 0 ? 'active' : '';
        secondaryHtml += `
          <div class="collections-secondary-card ${isActive}" data-cat="${cat.category}">
            <div class="submenu-header-row">
              <span class="submenu-category-title">All ${cat.name}</span>
              <a href="/shop.html?cat=${encodeURIComponent(cat.category)}" class="submenu-view-all-pill">VIEW ALL</a>
            </div>
            <ul class="submenu-types-list">
        `;
        if (cat.types && cat.types.length > 0) {
          cat.types.forEach(t => {
            secondaryHtml += `<li><a href="/shop.html?type=${encodeURIComponent(t)}" class="submenu-type-link">${t}</a></li>`;
          });
        } else {
          secondaryHtml += `<li><a href="/shop.html?cat=${encodeURIComponent(cat.category)}" class="submenu-type-link">Browse ${cat.name}</a></li>`;
        }
        secondaryHtml += `
            </ul>
          </div>
        `;
      });

      wrapper.innerHTML = primaryHtml + secondaryHtml;
    });
  }

  // Mobile Menu Collections Accordion: Renders exact dual-card layout matching Screenshot 1
  const mobileList = document.getElementById('menuDropdownCollectionsList');
  if (mobileList) {
    if (categoryStructure.length === 0) {
      mobileList.innerHTML = `
        <div style="padding: 12px; text-align: center; color: #78716c; font-size: 0.85rem;">
          Fresh collections arriving soon.
        </div>
      `;
    } else {
      let mobPrimaryHtml = '<div class="collections-primary-card hub-primary-card">';
      categoryStructure.forEach((cat, idx) => {
        const isActive = idx === 0 ? 'active' : '';
        mobPrimaryHtml += `
          <button type="button" class="collections-primary-link hub-cat-btn ${isActive}" data-cat="${cat.category}">
            <span>${cat.name}</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        `;
      });
      mobPrimaryHtml += '</div>';

      let mobSecondaryHtml = '<div class="hub-secondary-container">';
      categoryStructure.forEach((cat, idx) => {
        const isActive = idx === 0 ? 'active' : '';
        mobSecondaryHtml += `
          <div class="collections-secondary-card hub-secondary-card ${isActive}" data-cat="${cat.category}">
            <div class="submenu-header-row">
              <span class="submenu-category-title">All ${cat.name}</span>
              <a href="/shop.html?cat=${encodeURIComponent(cat.category)}" class="submenu-view-all-pill">VIEW ALL</a>
            </div>
            <ul class="submenu-types-list">
        `;
        if (cat.types && cat.types.length > 0) {
          cat.types.forEach(t => {
            mobSecondaryHtml += `
              <li>
                <a href="/shop.html?type=${encodeURIComponent(t)}" class="submenu-type-link">${t}</a>
              </li>
            `;
          });
        } else {
          mobSecondaryHtml += `<li><a href="/shop.html?cat=${encodeURIComponent(cat.category)}" class="submenu-type-link">Explore Collection</a></li>`;
        }
        mobSecondaryHtml += `
            </ul>
          </div>
        `;
      });
      mobSecondaryHtml += '</div>';

      mobileList.innerHTML = `
        <div class="collections-dual-card-stage mobile-menu-collections-stage" style="display: grid !important; grid-template-columns: 44% 56% !important; gap: 8px !important; padding: 10px 6px !important; background: #ffffff !important; border-radius: 14px !important; border: 1px solid #ebd9c8 !important; margin: 8px 0 !important; width: 100% !important; box-sizing: border-box !important;">
          ${mobPrimaryHtml}
          ${mobSecondaryHtml}
        </div>
        <div style="padding: 6px 12px 4px; text-align: center;">
          <a href="/collections.html" style="color: var(--brand-primary); font-weight: 700; font-size: 0.84rem; text-decoration: none;">★ View Full Curated Collections Page ➔</a>
        </div>
      `;
    }
  }

  // Re-bind listeners for hover/tap
  if (typeof initCollectionsFlyout === 'function') {
    initCollectionsFlyout();
  }
}

// Dynamic Collections Page Renderer (collections.html)
function renderDynamicCollectionsPage() {
  const dualStage = document.getElementById('collectionsDualCardStage');
  const cardsWrapper = document.getElementById('collectionsCardsWrapper');
  if (!dualStage && !cardsWrapper) return;

  if (dualStage) {
    if (categoryStructure.length === 0) {
      dualStage.innerHTML = `
        <div style="grid-column: 1 / -1; width: 100%; text-align: center; padding: 45px 20px; background: #ffffff; border-radius: 16px; border: 1px dashed #ebd9c8;">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">🏷️</div>
          <h3 style="font-size: 1.15rem; font-weight: 700; color: #1c1412; margin-bottom: 6px;">Fresh Collections Being Prepared</h3>
          <p style="color: #64748b; font-size: 0.88rem; max-width: 440px; margin: 0 auto;">Our woodfired bakeries and tea gardens are currently preparing seasonal batches. Please check back shortly.</p>
        </div>
      `;
    } else {
      let primaryHtml = '<div class="collections-primary-card hub-primary-card">';
      categoryStructure.forEach((cat, idx) => {
        const isActive = idx === 0 ? 'active' : '';
        primaryHtml += `
          <button type="button" class="collections-primary-link hub-cat-btn ${isActive}" data-cat="${cat.category}">
            <span>${cat.name}</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        `;
      });
      primaryHtml += '</div>';

      let secondaryHtml = '<div class="hub-secondary-container">';
      categoryStructure.forEach((cat, idx) => {
        const isActive = idx === 0 ? 'active' : '';
        secondaryHtml += `
          <div class="collections-secondary-card hub-secondary-card ${isActive}" data-cat="${cat.category}">
            <div class="submenu-header-row">
              <span class="submenu-category-title">All ${cat.name}</span>
              <a href="/shop.html?cat=${encodeURIComponent(cat.category)}" class="submenu-view-all-pill">VIEW ALL</a>
            </div>
            <ul class="submenu-types-list">
        `;
        if (cat.types && cat.types.length > 0) {
          cat.types.forEach(t => {
            secondaryHtml += `<li><a href="/shop.html?type=${encodeURIComponent(t)}" class="submenu-type-link">${t}</a></li>`;
          });
        } else {
          secondaryHtml += `<li><a href="/shop.html?cat=${encodeURIComponent(cat.category)}" class="submenu-type-link">Browse ${cat.name}</a></li>`;
        }
        secondaryHtml += `
            </ul>
          </div>
        `;
      });
      secondaryHtml += '</div>';

      dualStage.innerHTML = primaryHtml + secondaryHtml;
    }
  }

  if (cardsWrapper) {
    if (categoryStructure.length === 0) {
      cardsWrapper.innerHTML = `
        <div style="text-align: center; padding: 50px 20px; background: #ffffff; border-radius: 16px; border: 1px dashed #ebd9c8; margin: 10px 0;">
          <div style="font-size: 2.4rem; margin-bottom: 10px;">🏔️</div>
          <h3 style="font-size: 1.25rem; font-weight: 700; color: #1c1412; margin-bottom: 6px;">Curated Collections Coming Soon</h3>
          <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 18px; max-width: 440px; margin-left: auto; margin-right: auto;">Explore our authentic mountain recipes, fresh single-origin chocolates, and aromatic teas.</p>
          <a href="/" style="display: inline-block; padding: 10px 24px; background: #8B1A1A; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 0.88rem;">Explore Store Home ➔</a>
        </div>
      `;
    } else {
      let showcaseHtml = '';
      categoryStructure.forEach((cat, idx) => {
        const isReverse = idx % 2 === 1 ? 'reverse' : '';
        const typesPills = (cat.types || []).map(t => `
          <a href="/shop.html?type=${encodeURIComponent(t)}" class="collection-type-tag">${t}</a>
        `).join('');

        const priceLead = cat.startingPrice > 0 ? `Starting at <strong>₹${cat.startingPrice}</strong>` : `View Selection`;

        showcaseHtml += `
          <article class="collection-feature-row ${isReverse}">
            <div class="col-image-wrap">
              <img src="${cat.image || '/images/varkey-square.jpg'}" alt="${cat.name} Collection" onerror="this.src='/images/varkey-square.jpg'">
              <span class="col-badge-tag">${cat.badge || 'Hill Made Specialty'}</span>
            </div>
            <div class="col-content">
              <h2>${idx + 1}. ${cat.name}</h2>
              <p>${cat.description || `Authentic handcrafted Nilgiris ${cat.name}. Freshly prepared using heritage mountain recipes.`}</p>
              ${typesPills ? `
                <div class="collection-types-pills" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px;">
                  <span style="font-size:0.8rem; font-weight:700; color:#8B1A1A; align-self:center;">Types:</span>
                  ${typesPills}
                </div>
              ` : ''}
              <ul class="col-highlights-list">
                <li><span class="dot"></span> 100% Pure Vegetarian & FSSAI Certified</li>
                <li><span class="dot"></span> Fresh Batch Prepared in The Nilgiris</li>
                <li><span class="dot"></span> Sealed Freshness Guaranteed on Delivery</li>
              </ul>
              <div class="col-action-bar">
                <a href="/shop.html?cat=${encodeURIComponent(cat.category)}" class="btn-explore-collection">Explore ${cat.name} ➔</a>
                <span class="col-price-lead">${priceLead}</span>
              </div>
            </div>
          </article>
        `;
      });

      cardsWrapper.innerHTML = showcaseHtml;
    }
  }

  // Re-bind listeners for hover/tap
  if (typeof initCollectionsFlyout === 'function') {
    initCollectionsFlyout();
  }
}

// Check URL parameters & sync shop state
function checkUrlCategory() {
  if (typeof initShopFilters === 'function') {
    initShopFilters();
  }
}

// Initialize Shop Filters Sidebar & URL state
function initShopFilters() {
  const container = document.getElementById('categoryCheckboxesContainer');
  const urlParams = new URLSearchParams(window.location.search);
  const typeParam = urlParams.get('type');
  const typesParam = urlParams.get('types');
  const catParam = urlParams.get('cat');
  const catsParam = urlParams.get('cats');
  const searchParam = urlParams.get('search');
  const minParam = urlParams.get('min');
  const maxParam = urlParams.get('max');
  const sortParam = urlParams.get('sort');

  if (catParam) {
    storeState.selectedCategories.clear();
    storeState.selectedCategories.add(catParam.toLowerCase().trim());
    storeState.activeCategory = catParam.toLowerCase().trim();
  } else if (catsParam) {
    storeState.selectedCategories.clear();
    catsParam.split(',').map(c => c.trim().toLowerCase()).filter(Boolean).forEach(c => storeState.selectedCategories.add(c));
    storeState.activeCategory = 'all';
  }

  if (typeParam) {
    storeState.selectedTypes.clear();
    storeState.selectedTypes.add(typeParam);
  } else if (typesParam) {
    storeState.selectedTypes.clear();
    typesParam.split(',').map(t => t.trim()).filter(Boolean).forEach(t => storeState.selectedTypes.add(t));
  }

  if (searchParam) {
    storeState.filterSearch = searchParam.trim().toLowerCase();
    const sInput = document.getElementById('filterSearchInput');
    if (sInput) sInput.value = searchParam;
  }

  if (minParam !== null && !isNaN(Number(minParam))) {
    storeState.priceMin = Number(minParam);
    const minInput = document.getElementById('priceFromInput');
    if (minInput) minInput.value = storeState.priceMin;
  }
  if (maxParam !== null && !isNaN(Number(maxParam))) {
    storeState.priceMax = Number(maxParam);
    const maxInput = document.getElementById('priceToInput');
    if (maxInput) maxInput.value = storeState.priceMax;
  }
  if (sortParam) {
    storeState.sortBy = sortParam;
    const sortSelect = document.getElementById('shopSortSelect');
    if (sortSelect) sortSelect.value = sortParam;
  }

  // Populate Category Checkboxes if on Shop page (Screenshot 1: Categories list with counts)
  if (container) {
    let catCheckboxesHtml = '';
    categoryStructure.forEach(cat => {
      // Real count of products in this category
      const count = storeState.products.filter(p => {
        if (!p) return false;
        const pCat = (p.category || '').toLowerCase().trim();
        const target = cat.category.toLowerCase().trim();
        return pCat === target || pCat.replace(/[^a-z0-9]+/g, '-') === target;
      }).length;

      const isChecked = storeState.selectedCategories.has(cat.category) ||
        (storeState.activeCategory === cat.category);

      catCheckboxesHtml += `
        <label class="category-checkbox-item">
          <div class="cat-check-left">
            <input type="checkbox" class="cat-custom-checkbox filter-cat-cb" value="${cat.category}" data-cat="${cat.category}" ${isChecked ? 'checked' : ''}>
            <span class="cat-check-label">${cat.name}</span>
          </div>
          <span class="cat-check-count">(${count})</span>
        </label>
      `;
    });

    container.innerHTML = catCheckboxesHtml || '<p style="color:#888; font-size:0.85rem; padding:8px 0;">No categories available.</p>';

    // Attach change listener to category checkboxes
    container.querySelectorAll('.filter-cat-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const catVal = cb.value;
        if (cb.checked) {
          storeState.selectedCategories.add(catVal);
        } else {
          storeState.selectedCategories.delete(catVal);
          if (storeState.activeCategory === catVal) storeState.activeCategory = 'all';
        }
        updateShopUrlParams();
        renderProductsOnPages();
      });
    });

    // Populate Variety / Shape checkboxes if any exist
    const varietyContainer = document.getElementById('varietyCheckboxesContainer');
    const varietySection = document.getElementById('varietyFilterSection');
    if (varietyContainer && varietySection) {
      // Collect all distinct types from products
      const distinctTypes = new Set();
      storeState.products.forEach(p => {
        if (p && p.type && p.type.trim()) {
          distinctTypes.add(p.type.trim());
        }
      });

      if (distinctTypes.size > 0) {
        let typeCheckboxesHtml = '';
        distinctTypes.forEach(type => {
          const count = storeState.products.filter(p => {
            if (!p) return false;
            const pType = (p.type || '').trim().toLowerCase();
            return pType === type.toLowerCase();
          }).length;

          const isChecked = storeState.selectedTypes.has(type);

          typeCheckboxesHtml += `
            <label class="category-checkbox-item">
              <div class="cat-check-left">
                <input type="checkbox" class="cat-custom-checkbox filter-type-cb" value="${type}" ${isChecked ? 'checked' : ''}>
                <span class="cat-check-label">${type}</span>
              </div>
              <span class="cat-check-count">(${count})</span>
            </label>
          `;
        });

        varietyContainer.innerHTML = typeCheckboxesHtml;
        varietySection.style.display = 'block';

        varietyContainer.querySelectorAll('.filter-type-cb').forEach(cb => {
          cb.addEventListener('change', () => {
            const val = cb.value;
            if (cb.checked) {
              storeState.selectedTypes.add(val);
            } else {
              storeState.selectedTypes.delete(val);
            }
            updateShopUrlParams();
            renderProductsOnPages();
          });
        });
      } else {
        varietyContainer.innerHTML = '';
        varietySection.style.display = 'none';
      }
    }
  }

  // Wire search input in filter sidebar
  const filterSearchInput = document.getElementById('filterSearchInput');
  if (filterSearchInput && !filterSearchInput.dataset.bound) {
    filterSearchInput.dataset.bound = 'true';
    filterSearchInput.addEventListener('input', (e) => {
      storeState.filterSearch = e.target.value.trim().toLowerCase();
      updateShopUrlParams();
      renderProductsOnPages();
    });
  }

  // Wire price filter button
  const btnApplyPrice = document.getElementById('btnApplyPriceFilter');
  if (btnApplyPrice && !btnApplyPrice.dataset.bound) {
    btnApplyPrice.dataset.bound = 'true';
    btnApplyPrice.addEventListener('click', () => {
      const fromVal = parseFloat(document.getElementById('priceFromInput')?.value) || 0;
      const toVal = parseFloat(document.getElementById('priceToInput')?.value) || 9999;
      storeState.priceMin = Math.max(0, fromVal);
      storeState.priceMax = Math.max(storeState.priceMin, toVal);
      updateShopUrlParams();
      renderProductsOnPages();
    });
  }

  // Wire Clear All buttons
  const btnClearAllTop = document.getElementById('btnClearAllTop');
  if (btnClearAllTop && !btnClearAllTop.dataset.bound) {
    btnClearAllTop.dataset.bound = 'true';
    btnClearAllTop.addEventListener('click', resetAllShopFilters);
  }

  const btnResetFilters = document.getElementById('btnResetFilters');
  if (btnResetFilters && !btnResetFilters.dataset.bound) {
    btnResetFilters.dataset.bound = 'true';
    btnResetFilters.addEventListener('click', resetAllShopFilters);
  }

  // Wire Mobile Header Toggle & Clear button
  const mobileFilterToggle = document.getElementById('mobileFilterHeaderToggle');
  const filterBody = document.getElementById('shopFilterBody');
  if (mobileFilterToggle && filterBody && !mobileFilterToggle.dataset.bound) {
    mobileFilterToggle.dataset.bound = 'true';
    mobileFilterToggle.addEventListener('click', (e) => {
      if (e.target.closest('#btnClearAllMobile')) return;
      const isOpen = mobileFilterToggle.classList.toggle('is-open');
      filterBody.classList.toggle('is-open');
      mobileFilterToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  const btnClearAllMobile = document.getElementById('btnClearAllMobile');
  if (btnClearAllMobile && !btnClearAllMobile.dataset.bound) {
    btnClearAllMobile.dataset.bound = 'true';
    btnClearAllMobile.addEventListener('click', (e) => {
      e.stopPropagation();
      resetAllShopFilters();
    });
  }

  // Wire shop sort select
  const shopSortSelect = document.getElementById('shopSortSelect');
  if (shopSortSelect && !shopSortSelect.dataset.bound) {
    shopSortSelect.dataset.bound = 'true';
    shopSortSelect.addEventListener('change', (e) => {
      storeState.sortBy = e.target.value;
      updateShopUrlParams();
      renderProductsOnPages();
    });
  }
}

// Update URL parameters without reloading
function updateShopUrlParams() {
  if (!window.location.pathname.includes('/shop')) return;
  const params = new URLSearchParams();
  if (storeState.selectedCategories.size === 1) {
    params.set('cat', Array.from(storeState.selectedCategories)[0]);
  } else if (storeState.selectedCategories.size > 1) {
    params.set('cats', Array.from(storeState.selectedCategories).join(','));
  } else if (storeState.activeCategory !== 'all') {
    params.set('cat', storeState.activeCategory);
  }

  if (storeState.selectedTypes.size === 1) {
    params.set('type', Array.from(storeState.selectedTypes)[0]);
  } else if (storeState.selectedTypes.size > 1) {
    params.set('types', Array.from(storeState.selectedTypes).join(','));
  }

  if (storeState.filterSearch) {
    params.set('search', storeState.filterSearch);
  }
  if (storeState.priceMin > 0) {
    params.set('min', storeState.priceMin);
  }
  if (storeState.priceMax < 9999) {
    params.set('max', storeState.priceMax);
  }
  if (storeState.sortBy && storeState.sortBy !== 'featured') {
    params.set('sort', storeState.sortBy);
  }

  const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
  window.history.replaceState({}, '', newUrl);
}

// Remove single active filter category pill tag
window.removeSelectedCategory = function(catSlug) {
  storeState.selectedCategories.delete(catSlug);
  if (storeState.activeCategory === catSlug) storeState.activeCategory = 'all';
  const cb = document.querySelector(`.filter-cat-cb[value="${CSS.escape(catSlug)}"]`);
  if (cb) cb.checked = false;
  updateShopUrlParams();
  renderProductsOnPages();
};

// Remove single active filter pill tag
window.removeSelectedType = function(type) {
  storeState.selectedTypes.delete(type);
  const cb = document.querySelector(`.filter-type-cb[value="${CSS.escape(type)}"]`);
  if (cb) cb.checked = false;
  updateShopUrlParams();
  renderProductsOnPages();
};

// Reset all filters to default
window.resetAllShopFilters = function() {
  storeState.selectedCategories.clear();
  storeState.selectedTypes.clear();
  storeState.activeCategory = 'all';
  storeState.filterSearch = '';
  storeState.priceMin = 0;
  storeState.priceMax = 9999;
  storeState.sortBy = 'featured';

  const sInput = document.getElementById('filterSearchInput');
  if (sInput) sInput.value = '';
  const pFrom = document.getElementById('priceFromInput');
  if (pFrom) pFrom.value = '0';
  const pTo = document.getElementById('priceToInput');
  if (pTo) pTo.value = '2999';
  const sortSelect = document.getElementById('shopSortSelect');
  if (sortSelect) sortSelect.value = 'featured';

  document.querySelectorAll('.filter-cat-cb, .filter-type-cb, .cat-custom-checkbox').forEach(cb => {
    cb.checked = false;
  });

  if (window.location.pathname.includes('/shop')) {
    window.history.replaceState({}, '', '/shop.html');
  }

  renderProductsOnPages();
};

// Render Products with Filters, Counts, Active Pills, and Empty State
function renderProductsOnPages() {
  const homeGrid = document.getElementById('homeProductsGrid');
  const shopGrid = document.getElementById('shopProductsGrid');

  // Filter products
  let filtered = storeState.products.filter(p => {
    if (!p) return false;

    // 1. Category filter
    if (storeState.selectedCategories.size > 0) {
      const pCat = (p.category || '').toLowerCase().trim();
      const matchCat = Array.from(storeState.selectedCategories).some(c => {
        const target = c.toLowerCase().trim();
        return pCat === target || pCat.replace(/[^a-z0-9]+/g, '-') === target;
      });
      if (!matchCat) return false;
    } else if (storeState.activeCategory !== 'all') {
      const pCat = (p.category || '').toLowerCase().trim();
      if (pCat !== storeState.activeCategory.toLowerCase().trim()) return false;
    }

    // 2. Types checkbox filter
    if (storeState.selectedTypes.size > 0) {
      const pType = (p.type || '').trim().toLowerCase();
      const pName = (p.name || '').toLowerCase();
      const matchType = Array.from(storeState.selectedTypes).some(sel => {
        const s = sel.trim().toLowerCase();
        return pType === s || pType.includes(s) || pName.includes(s);
      });
      if (!matchType) return false;
    }

    // 3. Search query filter
    if (storeState.filterSearch) {
      const q = storeState.filterSearch;
      const matchSearch = (p.name && p.name.toLowerCase().includes(q)) ||
                          (p.type && p.type.toLowerCase().includes(q)) ||
                          (p.category && p.category.toLowerCase().includes(q)) ||
                          (p.categoryName && p.categoryName.toLowerCase().includes(q)) ||
                          (p.id && p.id.toLowerCase().includes(q));
      if (!matchSearch) return false;
    }

    // 4. Price filter
    const priceNum = typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0;
    if (priceNum < storeState.priceMin || priceNum > storeState.priceMax) {
      return false;
    }

    return true;
  });

  // Sort products
  if (storeState.sortBy === 'price-low') {
    filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (storeState.sortBy === 'price-high') {
    filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (storeState.sortBy === 'rating') {
    filtered.sort((a, b) => (b.rating || 5) - (a.rating || 5));
  }

  // Update Shop Active Filter Tag Pills (Screenshot 2: [ Narayanpet cotton ✕ ])
  const tagsContainer = document.getElementById('activeFilterTagsContainer');
  if (tagsContainer) {
    let pillsHtml = '';

    // Category pills
    storeState.selectedCategories.forEach(catSlug => {
      const catObj = categoryStructure.find(c => c.category === catSlug);
      const catName = catObj ? catObj.name : catSlug;
      pillsHtml += `
        <span class="active-filter-pill">
          <span>${catName}</span>
          <button type="button" class="pill-remove-btn" onclick="removeSelectedCategory('${catSlug}')" title="Remove category filter" aria-label="Remove ${catName} filter">✕</button>
        </span>
      `;
    });

    // Variety / Type pills
    storeState.selectedTypes.forEach(type => {
      pillsHtml += `
        <span class="active-filter-pill">
          <span>${type}</span>
          <button type="button" class="pill-remove-btn" onclick="removeSelectedType('${type}')" title="Remove type filter" aria-label="Remove ${type} filter">✕</button>
        </span>
      `;
    });

    if (storeState.filterSearch) {
      pillsHtml += `
        <span class="active-filter-pill">
          <span>Search: "${storeState.filterSearch}"</span>
          <button type="button" class="pill-remove-btn" onclick="storeState.filterSearch=''; document.getElementById('filterSearchInput').value=''; updateShopUrlParams(); renderProductsOnPages();" title="Clear search">✕</button>
        </span>
      `;
    }

    if (storeState.activeCategory !== 'all' && storeState.selectedCategories.size === 0 && storeState.selectedTypes.size === 0) {
      const catObj = categoryStructure.find(c => c.category === storeState.activeCategory);
      const catName = catObj ? catObj.name : storeState.activeCategory;
      pillsHtml += `
        <span class="active-filter-pill">
          <span>${catName}</span>
          <button type="button" class="pill-remove-btn" onclick="storeState.activeCategory='all'; updateShopUrlParams(); renderProductsOnPages();" title="Remove category">✕</button>
        </span>
      `;
    }

    if (pillsHtml.trim()) {
      pillsHtml += `
        <button type="button" class="btn-clear-all-link" style="margin-left: 6px;" onclick="resetAllShopFilters()">Clear All</button>
      `;
      tagsContainer.innerHTML = pillsHtml;
      tagsContainer.style.display = 'flex';
    } else {
      tagsContainer.innerHTML = '';
      tagsContainer.style.display = 'none';
    }
  }

  // Update Mobile Filter Badge count
  const mBadge = document.getElementById('mobileFilterBadge');
  if (mBadge) {
    const activeFiltersCount = storeState.selectedCategories.size +
      storeState.selectedTypes.size +
      (storeState.filterSearch ? 1 : 0) +
      (storeState.activeCategory !== 'all' && storeState.selectedCategories.size === 0 && storeState.selectedTypes.size === 0 ? 1 : 0) +
      (storeState.priceMin > 0 || storeState.priceMax < 2999 ? 1 : 0);
    if (activeFiltersCount > 0) {
      mBadge.textContent = activeFiltersCount;
      mBadge.style.display = 'inline-flex';
    } else {
      mBadge.style.display = 'none';
    }
  }


  // Update Result Count Label
  const countLabel = document.getElementById('shopProductCountLabel');
  if (countLabel) {
    if (filtered.length === storeState.products.length) {
      countLabel.textContent = `Showing All ${filtered.length} Delicacies`;
    } else {
      countLabel.textContent = `Showing ${filtered.length} of ${storeState.products.length} Products`;
    }
  }

  // Render cards or empty state
  const cardsHtml = filtered.map(p => createProductCardHtml(p)).join('');

  const emptyStateHtml = `
    <div class="shop-empty-state" style="grid-column: 1/-1; text-align: center; padding: 60px 24px; background: #ffffff; border-radius: 16px; border: 1px dashed #ebd9c8; margin: 20px 0;">
      <div style="font-size: 3rem; margin-bottom: 12px;">🏔️</div>
      <h3 style="font-family: var(--font-serif); font-size: 1.45rem; color: #8B1A1A; margin-bottom: 8px;">No Matching Products Available</h3>
      <p style="font-size: 0.92rem; color: #666; max-width: 460px; margin: 0 auto 20px; line-height: 1.5;">We couldn't find any Nilgiris delicacies matching your selected criteria. Try resetting your filters to explore all available products.</p>
      <button type="button" class="btn-apply-price-filter" style="width: auto; padding: 12px 28px; display: inline-block;" onclick="resetAllShopFilters()">View All Available Products</button>
    </div>
  `;

  const emptyCatalogHtml = `
    <div class="shop-empty-state" style="grid-column: 1/-1; text-align: center; padding: 60px 24px; background: #ffffff; border-radius: 16px; border: 1px dashed #ebd9c8; margin: 20px 0;">
      <div style="font-size: 3rem; margin-bottom: 12px;">🏔️</div>
      <h3 style="font-family: var(--font-serif); font-size: 1.45rem; color: #8B1A1A; margin-bottom: 8px;">Fresh Batches Arriving Soon</h3>
      <p style="font-size: 0.92rem; color: #64748b; max-width: 440px; margin: 0 auto 20px; line-height: 1.5;">Our master bakers and tea pickers in The Nilgiris are currently preparing authentic fresh batches. Please check back shortly or explore our story.</p>
      <a href="/about.html" class="btn-primary" style="display: inline-block; padding: 11px 26px; background: #8B1A1A; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 0.88rem;">Discover Our Heritage ➔</a>
    </div>
  `;

  if (homeGrid) {
    homeGrid.innerHTML = cardsHtml.length > 0 ? cardsHtml : '<p style="grid-column: 1/-1; text-align: center; color: #888; padding: 30px; font-size: 0.95rem;">Fresh morning batches are currently being prepared. Check back shortly!</p>';
  }

  if (shopGrid) {
    if (storeState.products.length === 0) {
      shopGrid.innerHTML = emptyCatalogHtml;
    } else {
      shopGrid.innerHTML = cardsHtml.length > 0 ? cardsHtml : emptyStateHtml;
    }
  }
}

function createProductCardHtml(p) {
  const isWish = storeState.wishlist && storeState.wishlist.includes(p.id);
  const formattedPrice = typeof p.price === 'number' ? p.price.toLocaleString('en-IN') : p.price;
  return `
    <div class="product-card" data-id="${p.id}" tabindex="0">
      <div class="product-image-wrap">
        <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.src='/images/varkey.jpg'">
        ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
        <button type="button" class="product-wishlist-heart ${isWish ? 'active' : ''}" onclick="toggleWishlist('${p.id}', event)" title="Wishlist" aria-label="Wishlist">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        </button>
        <button type="button" class="product-overlay-add-cart" onclick="addToCart('${p.id}', event)" aria-label="Add ${p.name} to Cart">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <path d="M16 10a4 4 0 0 1-8 0"></path>
          </svg>
          <span>ADD TO CART</span>
        </button>
      </div>

      <div class="product-info">
        <h3 class="product-title">${p.name}</h3>
        <div class="product-price">₹${formattedPrice}</div>
      </div>
    </div>
  `;
}

// =========================================================
// CART MANAGEMENT & DYNAMIC WEIGHT-TO-PRICE CONTROLLER (100g to 1 kg)
// =========================================================

function getProductBaseGrams(productOrUnit) {
  const unitStr = typeof productOrUnit === 'string'
    ? productOrUnit
    : (productOrUnit?.baseUnit || productOrUnit?.unit || '');
  const match = unitStr.match(/(\d+(?:\.\d+)?)\s*(kg|g)/i);
  if (match) {
    const val = parseFloat(match[1]);
    const u = match[2].toLowerCase();
    return u === 'kg' ? Math.round(val * 1000) : Math.round(val);
  }
  return 500;
}

function getGramsForWeightKey(weightKey) {
  if (weightKey === '100g') return 100;
  if (weightKey === '250g') return 250;
  if (weightKey === '500g') return 500;
  if (weightKey === '1kg') return 1000;
  return 500;
}

window.calculatePriceForWeight = function(productOrItem, weightKey) {
  if (!productOrItem) return 0;
  const basePrice = Number(productOrItem.basePrice || productOrItem.price || 0);
  const baseGrams = getProductBaseGrams(productOrItem.baseUnit || productOrItem.unit);
  const targetGrams = getGramsForWeightKey(weightKey);

  if (!baseGrams || baseGrams <= 0 || !basePrice || basePrice <= 0) return basePrice;
  return Math.round((basePrice / baseGrams) * targetGrams);
};

// Standard weight tiers (100g to 1 kg) - No amounts inside the selector
function getWeightOptionsForProduct(productOrItem) {
  return [
    { key: '100g', label: '100 g', name: '100 g Pack' },
    { key: '250g', label: '250 g', name: '250 g Pack' },
    { key: '500g', label: '500 g', name: '500 g Pack' },
    { key: '1kg',  label: '1 kg',  name: '1 kg Pack' }
  ];
}

function getDefaultWeightKeyForProduct(product) {
  const g = getProductBaseGrams(product.unit || product.baseUnit);
  if (g <= 150) return '100g';
  if (g <= 350) return '250g';
  if (g <= 750) return '500g';
  return '1kg';
}

// User-selectable weight changer inside cart drawer & cart page
// Price dynamically scales according to chosen weight based on admin base price!
window.changeCartItemWeight = (productId, newWeightKey) => {
  const item = storeState.cart.find(c => c.id === productId);
  if (!item) return;

  const origProduct = (typeof storeState !== 'undefined' && storeState.products)
    ? storeState.products.find(p => p.id === productId)
    : null;

  const basePrice = origProduct ? Number(origProduct.price) : Number(item.basePrice || item.price);
  const baseUnit = origProduct ? origProduct.unit : (item.baseUnit || item.unit);

  const options = getWeightOptionsForProduct(item);
  const matched = options.find(o => o.key === newWeightKey);
  if (matched) {
    item.selectedWeight = matched.key;
    item.unit = matched.label;
    item.basePrice = basePrice;
    item.baseUnit = baseUnit;
    item.price = window.calculatePriceForWeight(item, newWeightKey);
    saveCartToStorage();
    renderCart();
  }
};

// =========================================================
// PROFESSIONAL ITEM DELETION CONFIRMATION MODAL (BAG & WISHLIST)
// =========================================================
let pendingItemDeletion = null;

function ensureDeleteConfirmModal() {
  let modal = document.getElementById('deleteConfirmModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'deleteConfirmModal';
    modal.className = 'delete-confirm-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="delete-confirm-card">
        <button type="button" class="delete-confirm-close-btn" id="btnDeleteClose" aria-label="Close">✕</button>
        <div class="delete-confirm-icon-wrap">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </div>
        <span class="delete-confirm-badge" id="deleteConfirmBadge">SHOPPING BAG</span>
        <h3 class="delete-confirm-title" id="deleteConfirmTitle">Remove Delicacy?</h3>
        
        <div class="delete-confirm-product-chip" id="deleteConfirmProductChip">
          <img id="deleteConfirmProductImg" src="/images/varkey.jpg" alt="" class="delete-confirm-img" onerror="this.src='/images/varkey.jpg'">
          <div class="delete-confirm-product-info">
            <h4 id="deleteConfirmProductName" class="delete-confirm-pname">Product Name</h4>
            <div class="delete-confirm-pmeta">
              <span id="deleteConfirmProductPrice" class="delete-confirm-pprice">₹0</span>
              <span id="deleteConfirmProductUnit" class="delete-confirm-punit">• 500 g</span>
            </div>
          </div>
        </div>

        <p class="delete-confirm-desc" id="deleteConfirmDesc">
          Are you sure you want to remove this delicacy from your shopping bag? You can always add it back from the catalog.
        </p>

        <div class="delete-confirm-actions">
          <button type="button" class="btn-delete-cancel" id="btnDeleteCancel">Keep Item</button>
          <button type="button" class="btn-delete-confirm" id="btnDeleteConfirm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Yes, Remove</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const btnCancel = modal.querySelector('#btnDeleteCancel');
    const btnClose = modal.querySelector('#btnDeleteClose');
    const btnConfirm = modal.querySelector('#btnDeleteConfirm');

    if (btnCancel) btnCancel.addEventListener('click', closeDeleteConfirmModal);
    if (btnClose) btnClose.addEventListener('click', closeDeleteConfirmModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeDeleteConfirmModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeDeleteConfirmModal();
      }
    });

    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => {
        executePendingItemDeletion();
      });
    }
  }
  return modal;
}

window.promptRemoveCartItem = (productId, event) => {
  if (event) {
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }

  const item = (storeState.cart || []).find(c => c.id === productId);
  const orig = (storeState.products || []).find(p => p.id === productId);

  const name = item?.name || orig?.name || 'Selected Item';
  const img = item?.image || orig?.image || '/images/varkey.jpg';
  const price = item?.price || orig?.price || 0;
  const unit = item?.unit || orig?.unit || '';

  pendingItemDeletion = {
    type: 'cart',
    id: productId,
    name: name
  };

  const modal = ensureDeleteConfirmModal();
  const badgeEl = document.getElementById('deleteConfirmBadge');
  const titleEl = document.getElementById('deleteConfirmTitle');
  const descEl = document.getElementById('deleteConfirmDesc');
  const imgEl = document.getElementById('deleteConfirmProductImg');
  const nameEl = document.getElementById('deleteConfirmProductName');
  const priceEl = document.getElementById('deleteConfirmProductPrice');
  const unitEl = document.getElementById('deleteConfirmProductUnit');

  if (badgeEl) badgeEl.textContent = 'SHOPPING BAG';
  if (titleEl) titleEl.textContent = 'Remove from Bag?';
  if (descEl) descEl.textContent = 'Are you sure you want to remove this delicacy from your shopping bag? You can always add it back from the catalog.';
  if (imgEl) { imgEl.src = img; imgEl.alt = name; }
  if (nameEl) nameEl.textContent = name;
  if (priceEl) priceEl.textContent = `₹${price}`;
  if (unitEl) unitEl.textContent = unit ? ` • ${unit}` : '';

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.promptRemoveWishlistItem = (productId, event) => {
  if (event) {
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }

  const prod = (storeState.products || []).find(p => p.id === productId);
  const name = prod?.name || 'Saved Item';
  const img = prod?.image || '/images/varkey.jpg';
  const price = prod?.price || 0;
  const unit = prod?.unit || '';

  pendingItemDeletion = {
    type: 'wishlist',
    id: productId,
    name: name
  };

  const modal = ensureDeleteConfirmModal();
  const badgeEl = document.getElementById('deleteConfirmBadge');
  const titleEl = document.getElementById('deleteConfirmTitle');
  const descEl = document.getElementById('deleteConfirmDesc');
  const imgEl = document.getElementById('deleteConfirmProductImg');
  const nameEl = document.getElementById('deleteConfirmProductName');
  const priceEl = document.getElementById('deleteConfirmProductPrice');
  const unitEl = document.getElementById('deleteConfirmProductUnit');

  if (badgeEl) badgeEl.textContent = 'WISHLIST';
  if (titleEl) titleEl.textContent = 'Remove from Wishlist?';
  if (descEl) descEl.textContent = 'Are you sure you want to remove this delicacy from your saved wishlist?';
  if (imgEl) { imgEl.src = img; imgEl.alt = name; }
  if (nameEl) nameEl.textContent = name;
  if (priceEl) priceEl.textContent = `₹${price}`;
  if (unitEl) unitEl.textContent = unit ? ` • ${unit}` : '';

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

function closeDeleteConfirmModal() {
  const modal = document.getElementById('deleteConfirmModal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
  pendingItemDeletion = null;
}

function showToastFeedback(message, icon = '✓') {
  let toast = document.getElementById('globalActionToast');
  if (toast) toast.remove();

  toast = document.createElement('div');
  toast.id = 'globalActionToast';
  toast.className = 'cart-success-toast';
  toast.style.zIndex = '1000001';
  toast.innerHTML = `
    <div class="cart-toast-body">
      <span class="cart-toast-icon" style="color: #4ade80;">${icon}</span>
      <div class="cart-toast-text">
        <strong style="color: #ffffff; font-size: 0.88rem;">${message}</strong>
      </div>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast && toast.parentNode) {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }
  }, 2600);
}

function executePendingItemDeletion() {
  if (!pendingItemDeletion) return;
  const { type, id, name } = pendingItemDeletion;

  if (type === 'cart') {
    // 1. Remove from storeState.cart
    storeState.cart = (storeState.cart || []).filter(c => c.id !== id);

    // 2. Save synchronously to customer-scoped storage
    saveCartToStorage();

    // 3. Re-render Cart Drawer
    if (typeof renderCart === 'function') renderCart();

    // 4. Re-render Dedicated Cart Page if present
    if (typeof renderDedicatedCartPage === 'function') renderDedicatedCartPage();

    closeDeleteConfirmModal();
    showToastFeedback(`Removed "${name}" from shopping bag`);
  } else if (type === 'wishlist') {
    // 1. Remove from storeState.wishlist
    const idx = (storeState.wishlist || []).indexOf(id);
    if (idx > -1) {
      storeState.wishlist.splice(idx, 1);
    }
    // 2. Save synchronously to customer-scoped storage
    saveWishlistToStorage();

    // 3. Update Wishlist UI & Badges
    if (typeof updateWishlistUI === 'function') updateWishlistUI();
    if (typeof renderProductsOnPages === 'function') renderProductsOnPages();
    if (typeof renderWishlistModalItems === 'function') renderWishlistModalItems();
    if (typeof renderDedicatedWishlistPage === 'function') renderDedicatedWishlistPage();

    closeDeleteConfirmModal();
    showToastFeedback(`Removed "${name}" from wishlist`);
  }
}

// Global removal triggers
window.removeCartItem = (productId, event) => {
  window.promptRemoveCartItem(productId, event);
};

// Add to Cart handler: Adds smoothly WITHOUT opening the sidebar drawer
// Add to Cart handler: Adds smoothly WITHOUT opening the sidebar drawer
window.addToCart = (productId, event) => {
  if (event) {
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }
  const product = storeState.products.find(p => p.id === productId);
  if (!product) return;

  const adminBasePrice = Number(product.price);
  const defaultKey = getDefaultWeightKeyForProduct(product);
  const options = getWeightOptionsForProduct(product);
  const defaultOpt = options.find(o => o.key === defaultKey) || options[2];
  const initialPrice = window.calculatePriceForWeight(product, defaultKey);

  const existing = storeState.cart.find(c => c.id === productId);
  if (existing) {
    existing.quantity += 1;
    existing.basePrice = adminBasePrice;
    existing.baseUnit = product.unit;
    existing.price = window.calculatePriceForWeight(existing, existing.selectedWeight || defaultKey);
  } else {
    storeState.cart.push({
      id: product.id,
      name: product.name,
      image: product.image,
      basePrice: adminBasePrice,
      baseUnit: product.unit,
      selectedWeight: defaultOpt.key,
      unit: defaultOpt.label,
      price: initialPrice,
      quantity: 1
    });
  }

  saveCartToStorage();
  renderCart();

  // Instant Visual Feedback on Button
  const targetBtn = (event && event.currentTarget) ? event.currentTarget : (event && event.target ? event.target.closest('button') : null);
  if (targetBtn) {
    const origHtml = targetBtn.innerHTML;
    targetBtn.classList.add('added-feedback');
    targetBtn.innerHTML = `<span>✓</span> <span>ADDED</span>`;
    setTimeout(() => {
      targetBtn.innerHTML = origHtml;
      targetBtn.classList.remove('added-feedback');
    }, 1300);
  }

  // Floating Toast Notification with option to View Bag
  showCartSuccessToast(product.name, defaultOpt.label);

  // NOTE: openCartDrawer() is intentionally NOT triggered here
  // so the sidebar drawer does NOT slide in automatically, as requested by user!
};

function showCartSuccessToast(productName, unitName) {
  let toast = document.getElementById('cartSuccessToast');
  if (toast) toast.remove();

  toast = document.createElement('div');
  toast.id = 'cartSuccessToast';
  toast.className = 'cart-success-toast';
  toast.innerHTML = `
    <div class="cart-toast-body">
      <span class="cart-toast-icon">👜</span>
      <div class="cart-toast-text">
        <strong>Added to Bag</strong>
        <span>${productName} (${unitName})</span>
      </div>
      <button type="button" class="btn-toast-view-cart" onclick="openCartDrawer(); this.closest('#cartSuccessToast').remove();">
        View Bag ➔
      </button>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast && toast.parentNode) {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }
  }, 3500);
}

window.updateCartQty = (productId, delta) => {
  const item = storeState.cart.find(c => c.id === productId);
  if (!item) return;

  if (item.quantity === 1 && delta === -1) {
    window.promptRemoveCartItem(productId);
    return;
  }

  item.quantity += delta;
  if (item.quantity <= 0) {
    storeState.cart = storeState.cart.filter(c => c.id !== productId);
  }

  saveCartToStorage();
  renderCart();
};

function renderCart() {
  const count = storeState.cart.reduce((sum, it) => sum + it.quantity, 0);
  document.querySelectorAll('#cartBadge, #cartBadgeCount, .cart-badge-count').forEach(b => {
    b.textContent = count;
    b.style.display = count > 0 ? 'flex' : 'none';
  });

  // Dynamically update each cart item's price based on its selected weight & base catalog price
  if (storeState.products && storeState.products.length > 0) {
    storeState.cart.forEach(it => {
      const orig = storeState.products.find(p => p.id === it.id);
      if (orig) {
        it.basePrice = Number(orig.price);
        it.baseUnit = orig.unit;
        it.price = window.calculatePriceForWeight(it, it.selectedWeight || '500g');
      }
    });
  }

  if (typeof renderDedicatedCartPage === 'function') {
    renderDedicatedCartPage();
  }

  if (!cartItemsContainer) return;

  if (storeState.cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #a8a29e;">
        <div style="font-size: 3rem; margin-bottom: 10px;">👜</div>
        <h4 style="font-family: var(--font-serif); font-size: 1.2rem; color: #1c1917; margin-bottom: 6px;">Your Bag is Empty</h4>
        <p style="font-size: 0.88rem;">Explore our fresh Nilgiris bakery treats & chocolates.</p>
      </div>
    `;
    if (cartSubtotalEl) cartSubtotalEl.textContent = '₹0';
    if (cartDeliveryEl) cartDeliveryEl.textContent = '₹0';
    if (cartTotalEl) cartTotalEl.textContent = '₹0';
    return;
  }

  cartItemsContainer.innerHTML = storeState.cart.map(it => {
    const weightOpts = getWeightOptionsForProduct(it);
    const selectedKey = it.selectedWeight || '500g';

    return `
      <div class="cart-item-row">
        <img src="${it.image || '/images/varkey.jpg'}" alt="${it.name}" class="cart-item-thumb" onerror="this.src='/images/varkey.jpg'">
        <div class="cart-item-info-col">
          <div class="cart-item-header-row">
            <h4 class="cart-item-title">${it.name}</h4>
            <button type="button" class="btn-cart-remove" onclick="promptRemoveCartItem('${it.id}', event)" title="Remove item" aria-label="Remove item">✕</button>
          </div>
          
          <!-- Weight Selection: 100g to 1 kg Option (No amount inside dropdown) -->
          <div class="cart-weight-picker">
            <label class="cart-weight-picker-lbl">Weight:</label>
            <select class="cart-weight-select" onchange="changeCartItemWeight('${it.id}', this.value)" aria-label="Choose weight for ${it.name}">
              ${weightOpts.map(opt => `
                <option value="${opt.key}" ${selectedKey === opt.key ? 'selected' : ''}>
                  ${opt.label}
                </option>
              `).join('')}
            </select>
          </div>

          <div class="cart-item-bottom-row">
            <div class="cart-stepper-compact">
              <button type="button" class="cart-stepper-btn" onclick="updateCartQty('${it.id}', -1)" aria-label="Decrease quantity">−</button>
              <span class="cart-stepper-num">${it.quantity}</span>
              <button type="button" class="cart-stepper-btn" onclick="updateCartQty('${it.id}', 1)" aria-label="Increase quantity">+</button>
            </div>
            <div class="cart-item-price-box">
              <span class="cart-item-unit-rate">₹${it.price} each</span>
              <strong class="cart-item-line-total">₹${it.price * it.quantity}</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const subtotal = storeState.cart.reduce((s, it) => s + (it.price * it.quantity), 0);
  const threshold = storeState.settings.freeDeliveryThreshold || 500;
  const isFree = subtotal >= threshold;
  const delivery = isFree ? 0 : (storeState.settings.standardDeliveryCharge || 40);
  const total = subtotal + delivery;

  if (cartSubtotalEl) cartSubtotalEl.textContent = `₹${subtotal}`;
  if (cartDeliveryEl) cartDeliveryEl.textContent = isFree ? 'FREE' : `₹${delivery}`;
  if (cartTotalEl) cartTotalEl.textContent = `₹${total}`;
}

function saveCartToStorage() {
  localStorage.setItem('ooty_luxury_cart', JSON.stringify(storeState.cart));
  localStorage.setItem('ooty_cart', JSON.stringify(storeState.cart));
}

function loadCartFromStorage() {
  try {
    const s = localStorage.getItem('ooty_luxury_cart') || localStorage.getItem('ooty_cart');
    if (s) storeState.cart = JSON.parse(s);
  } catch (e) {
    storeState.cart = [];
  }
}

// Drawer Toggles
function openCartDrawer() {
  if (cartDrawer) cartDrawer.classList.add('active');
  if (cartBackdrop) cartBackdrop.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCartDrawer() {
  if (cartDrawer) cartDrawer.classList.remove('active');
  if (cartBackdrop) cartBackdrop.classList.remove('active');
  document.body.style.overflow = '';
}

// UI Event Listeners
function setupUIEvents() {
  // Product Card Touch Interaction (Mobile / Tablet: touch reveals ADD TO CART overlay button)
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    const isCartAction = e.target.closest('.product-overlay-add-cart');
    const isWishAction = e.target.closest('.product-wishlist-heart');
    
    document.querySelectorAll('.product-card.touch-active').forEach(c => {
      if (c !== card) c.classList.remove('touch-active');
    });

    if (card && !isCartAction && !isWishAction) {
      card.classList.toggle('touch-active');
    }
  });

  // Cart button trigger in header -> Dedicated Shopping Cart Page (Exact Screenshot Box Reference)
  const cartBtn = document.getElementById('btnHeaderCart');
  if (cartBtn) {
    cartBtn.addEventListener('click', (e) => {
      const p = window.location.pathname;
      if (p !== '/cart' && p !== '/cart/' && p !== '/cart.html') {
        window.location.href = '/cart';
      } else if (typeof renderDedicatedCartPage === 'function') {
        renderDedicatedCartPage();
      }
    });
  }

  const closeCartBtn = document.getElementById('closeCartBtn');
  if (closeCartBtn) closeCartBtn.addEventListener('click', closeCartDrawer);

  if (cartBackdrop) cartBackdrop.addEventListener('click', closeCartDrawer);

  // User Account icon in header -> Toggle Dropdown Card
  const accountBtn = document.getElementById('btnUserAccount');
  if (accountBtn && accountDropdownCard) {
    accountBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('headerNavDropdownCard')?.classList.remove('active');
      document.getElementById('btnHeaderMenuToggle')?.classList.remove('active');
      accountDropdownCard.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!accountDropdownCard.contains(e.target) && e.target !== accountBtn) {
        accountDropdownCard.classList.remove('active');
      }
    });
  }

  // Dropdown Menu Item 1: My Orders -> Dedicated Customer Orders Portal
  const handleNavOrders = (e) => {
    if (e) e.preventDefault();
    accountDropdownCard?.classList.remove('active');
    const p = window.location.pathname;
    if (p === '/account' || p === '/account.html') {
      const targetBtn = document.querySelector('.portal-tab-btn[data-portal-tab="orders"]');
      if (targetBtn) targetBtn.click();
    } else {
      window.location.href = '/account?tab=orders';
    }
  };
  window.handleMenuNavOrders = handleNavOrders;
  document.querySelectorAll('#menuActionOrders, .menu-action-orders').forEach(el => {
    el.addEventListener('click', handleNavOrders);
  });

  // Dropdown Menu Item 2: My Addresses -> Dedicated Delivery Addresses Portal
  const handleNavAddresses = (e) => {
    if (e) e.preventDefault();
    accountDropdownCard?.classList.remove('active');
    const p = window.location.pathname;
    if (p === '/account' || p === '/account.html') {
      const targetBtn = document.querySelector('.portal-tab-btn[data-portal-tab="addresses"]');
      if (targetBtn) targetBtn.click();
    } else {
      window.location.href = '/account?tab=addresses';
    }
  };
  window.handleMenuNavAddresses = handleNavAddresses;
  document.querySelectorAll('#menuActionAddresses, .menu-action-addresses').forEach(el => {
    el.addEventListener('click', handleNavAddresses);
  });

  // Dropdown Menu Item 3: My Wishlist (Navigates to Dedicated Menagaii Wishlist Page)
  const menuWishlist = document.getElementById('menuActionWishlist');
  if (menuWishlist) {
    menuWishlist.addEventListener('click', () => {
      accountDropdownCard?.classList.remove('active');
      window.location.href = '/wishlist';
    });
  }

  // Dropdown Menu Item 4: Shopping Cart -> Dedicated Cart Page
  const menuCart = document.getElementById('menuActionCart');
  if (menuCart) {
    menuCart.addEventListener('click', () => {
      accountDropdownCard?.classList.remove('active');
      window.location.href = '/cart';
    });
  }

  // Dropdown Menu Item 5: Login / Logout
  const menuAuth = document.getElementById('menuActionAuth');
  if (menuAuth) {
    menuAuth.addEventListener('click', () => {
      accountDropdownCard?.classList.remove('active');
      if (storeState.customer) {
        logoutCustomer();
      } else {
        window.location.href = '/login.html';
      }
    });
  }

  // Wishlist button in header -> Dedicated Wishlist Page (Exact Menagaii Reference)
  const wishBtn = document.getElementById('btnWishlist');
  if (wishBtn) {
    wishBtn.addEventListener('click', () => {
      const p = window.location.pathname;
      if (p !== '/wishlist' && p !== '/wishlist/' && p !== '/wishlist.html' && !p.includes('/pages/wishlist')) {
        window.location.href = '/wishlist';
      } else if (typeof renderDedicatedWishlistPage === 'function') {
        renderDedicatedWishlistPage();
      } else {
        openWishlistModal();
      }
    });
  }

  // Search button in header
  const searchBtn = document.getElementById('btnHeaderSearch');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      if (searchModal) {
        searchModal.classList.add('active');
        document.getElementById('globalSearchInput')?.focus();
      }
    });
  }

  // Global search input
  const searchInput = document.getElementById('globalSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const list = document.getElementById('searchResultList');
      if (!list) return;

      if (!q) {
        list.innerHTML = '';
        return;
      }

      const matches = storeState.products.filter(p => 
        p.name.toLowerCase().includes(q) || (p.tamilName && p.tamilName.includes(q))
      );

      if (matches.length === 0) {
        list.innerHTML = `<p style="padding: 10px; color: #a8a29e;">No snacks matching "${q}"</p>`;
        return;
      }

      list.innerHTML = matches.map(m => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid var(--border-light);">
          <div>
            <strong>${m.name}</strong> (${m.unit})
            <div style="font-size: 0.8rem; color: var(--brand-burgundy);">₹${m.price}</div>
          </div>
          <button type="button" class="btn-add-cart" style="padding: 6px 14px; font-size: 0.75rem;" onclick="addToCart('${m.id}'); closeAllModals();">
            + Add
          </button>
        </div>
      `).join('');
    });
  }

  // 5. Initialize Header Hamburger Navigation Dropdown (User Reference)
  initHeaderNavDropdown();
  initCollectionsFlyout();
  ensureMobileCollectionsUI();
  ensureFloatingWhatsAppWidget();
  setupUniversalWhatsAppInterceptor();

  // Filter tabs on Shop page
  const filterTabs = document.querySelectorAll('.filter-tab');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => {
        t.style.background = 'transparent';
        t.style.color = 'var(--text-primary)';
      });
      tab.style.background = 'var(--brand-burgundy)';
      tab.style.color = 'white';

      storeState.activeCategory = tab.getAttribute('data-cat');
      renderProductsOnPages();
    });
  });

  // Pre-fill Checkout Form from logged-in customer data
  function prefillCheckoutForm() {
    const cust = storeState.customer || JSON.parse(localStorage.getItem('ooty_customer') || 'null');
    if (cust) {
      const nameEl = document.getElementById('custName');
      const phoneEl = document.getElementById('custPhone');
      const addrEl = document.getElementById('custAddress');
      const cityEl = document.getElementById('custCity');
      const pinEl = document.getElementById('custPincode');

      if (nameEl && !nameEl.value && cust.name) nameEl.value = cust.name;
      if (phoneEl && !phoneEl.value && cust.phone) phoneEl.value = cust.phone.replace(/\D/g, '').slice(-10);
      if (addrEl && !addrEl.value && cust.address) addrEl.value = cust.address;
      if (cityEl && !cityEl.value && cust.city) cityEl.value = cust.city;
      if (pinEl && !pinEl.value && cust.pincode) pinEl.value = cust.pincode;
    }
  }

  // Proceed to Checkout
  const checkoutBtn = document.getElementById('proceedToCheckoutBtn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      if (storeState.cart.length === 0) {
        alert('Your bag is empty!');
        return;
      }
      closeCartDrawer();
      prefillCheckoutForm();
      if (checkoutModal) checkoutModal.classList.add('active');
    });
  }

  // Checkout Form
  const checkoutForm = document.getElementById('checkoutForm');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = checkoutForm.querySelector('button[type="submit"]');
      const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳</span> Connecting to Owner WhatsApp...';
      }

      const payload = {
        customer: {
          name: document.getElementById('custName').value.trim(),
          phone: document.getElementById('custPhone').value.trim(),
          address: document.getElementById('custAddress').value.trim(),
          city: document.getElementById('custCity').value.trim(),
          pincode: document.getElementById('custPincode').value.trim()
        },
        items: storeState.cart,
        paymentMethod: document.getElementById('custPayment').value
      };

      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          storeState.cart = [];
          saveCartToStorage();
          renderCart();
          closeAllModals();

          // Save customer info in storage and switch customer session
          if (!storeState.customer) {
            window.switchCustomerSession(payload.customer);
          }

          // Show Success Modal and launch WhatsApp directly to owner
          showOrderSuccessModal(data.order, data.whatsappUrl);
        } else {
          alert(data.message || 'Error creating order');
        }
      } catch (err) {
        alert('Server communication error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHtml;
        }
      }
    });
  }

  // Format dynamic WhatsApp URL targeting owner (9514292383) with full itemized bill
  function buildDynamicWhatsAppOrderUrl(order) {
    const ownerPhone = '919514292383';
    const items = order.items || [];
    const itemLines = items.map((it, idx) => 
      `${idx + 1}. *${it.name}* (${it.unit || 'Standard'}) x ${it.quantity} = ₹${it.total || (it.price * it.quantity)}`
    ).join('\n');

    const delText = (order.deliveryCharge === 0 || order.delivery === 0) ? 'FREE (Orders above ₹500)' : `₹${order.deliveryCharge || order.delivery || 40}`;

    const text = 
`🏔️ *NEW ORDER FROM HILL MADES SNACKS*
━━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* #${order.id}
📅 *Date:* ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}

👤 *Customer Details:*
• *Name:* ${order.customer?.name || 'Customer'}
• *Phone:* ${order.customer?.phone || ''}
• *Delivery Address:* ${order.customer?.address || ''}
${order.customer?.city ? `• *City:* ${order.customer.city}\n` : ''}${order.customer?.pincode ? `• *Pincode:* ${order.customer.pincode}\n` : ''}${order.customer?.notes ? `• *Notes:* ${order.customer.notes}\n` : ''}
🛒 *Ordered Items:*
${itemLines}

━━━━━━━━━━━━━━━━━━━
💵 *Subtotal:* ₹${order.subtotal || 0}
🚚 *Delivery:* ${delText}
💰 *TOTAL AMOUNT:* *₹${order.total || 0}*
💳 *Payment Mode:* ${order.paymentMethod || 'Cash on Delivery'}
━━━━━━━━━━━━━━━━━━━
Please confirm my order and send estimated delivery time! Thank you! 🙏`;

    return `https://wa.me/${ownerPhone}?text=${encodeURIComponent(text)}`;
  }

  // Display Order Success Modal and launch WhatsApp to owner (9514292383)
  function showOrderSuccessModal(order, whatsappUrl) {
    let modal = document.getElementById('orderSuccessModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.id = 'orderSuccessModal';
      document.body.appendChild(modal);
    }

    const ownerNumberFormatted = '+91 95142 92383';
    const finalWhatsAppUrl = whatsappUrl || buildDynamicWhatsAppOrderUrl(order);

    const items = order.items || [];
    const itemsHtml = items.map(it => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px dashed #e7e5e4; font-size: 0.88rem;">
        <div style="text-align: left; max-width: 72%;">
          <div style="font-weight: 700; color: #1c1917; font-size: 0.88rem;">${it.name}</div>
          <div style="font-size: 0.76rem; color: #78716c; margin-top: 1px;">
            <span style="display: inline-block; background: #f5f5f4; border-radius: 4px; padding: 1px 6px; font-weight: 600;">${it.unit || ''}</span>
            <span> × ${it.quantity}</span>
          </div>
        </div>
        <div style="font-weight: 700; color: #851321; font-size: 0.95rem;">
          ₹${(it.total || (it.price * it.quantity)).toLocaleString('en-IN')}
        </div>
      </div>
    `).join('');

    const deliveryFeeLabel = (order.deliveryCharge === 0 || order.delivery === 0)
      ? '<span style="color: #15803d; font-weight: 700;">FREE</span>'
      : `₹${order.deliveryCharge || order.delivery || 40}`;

    modal.innerHTML = `
      <div class="modal-card" style="text-align: center; max-width: 520px; width: 92%; padding: 24px 20px; border-radius: 18px; box-shadow: 0 25px 60px rgba(0,0,0,0.3); animation: scaleUp 0.3s ease-out; max-height: 90vh; overflow-y: auto;">
        
        <div style="width: 60px; height: 60px; margin: 0 auto 10px; border-radius: 50%; background: #dcfce7; color: #16a34a; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; box-shadow: 0 0 0 8px rgba(34, 197, 94, 0.12);">
          ✓
        </div>
        
        <h3 style="font-family: var(--font-serif, serif); font-size: 1.4rem; font-weight: 800; color: #1c1917; margin-bottom: 4px;">
          Order Placed Successfully!
        </h3>
        
        <div style="display: inline-block; background: #f5f5f4; border: 1px solid #e7e5e4; border-radius: 20px; padding: 3px 12px; font-weight: 700; font-size: 0.82rem; color: #44403c; margin-bottom: 12px;">
          Order #${order.id}
        </div>

        <!-- Dynamic Order Summary Card -->
        <div style="background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; text-align: left;">
          
          <div style="font-size: 0.75rem; font-weight: 800; color: #78716c; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
            Delivery Destination:
          </div>
          <div style="font-size: 0.88rem; color: #1c1917; font-weight: 600; line-height: 1.4; margin-bottom: 12px;">
            <div>👤 ${order.customer?.name || 'Customer'} (<span style="color: #44403c;">+91 ${order.customer?.phone || ''}</span>)</div>
            <div style="color: #57534e; font-weight: 400; font-size: 0.82rem; margin-top: 2px;">
              📍 ${order.customer?.address || ''}${order.customer?.city ? ', ' + order.customer.city : ''}${order.customer?.pincode ? ' - ' + order.customer.pincode : ''}
            </div>
          </div>

          <div style="font-size: 0.75rem; font-weight: 800; color: #78716c; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; padding-top: 6px; border-top: 1px solid #e7e5e4;">
            Delicacies Ordered:
          </div>
          <div style="margin-bottom: 10px;">
            ${itemsHtml}
          </div>

          <div style="padding-top: 8px; border-top: 1px solid #e7e5e4; font-size: 0.86rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #57534e;">
              <span>Subtotal:</span>
              <span style="font-weight: 600; color: #1c1917;">₹${(order.subtotal || 0).toLocaleString('en-IN')}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #57534e;">
              <span>Delivery Fee:</span>
              <span>${deliveryFeeLabel}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding-top: 6px; border-top: 1px dashed #d6d3d1; font-weight: 800; font-size: 1.05rem; color: #1c1917;">
              <span>Total Payable:</span>
              <span style="color: #851321;">₹${(order.total || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        <p style="font-size: 0.88rem; color: #57534e; margin-bottom: 14px; line-height: 1.4;">
          Tap below to send your pre-filled bill directly to Store Owner on WhatsApp (<strong style="color: #166534;">${ownerNumberFormatted}</strong>) to confirm dispatch:
        </p>

        <!-- EXACT BUTTON REQUESTED BY USER -->
        <a id="btnConfirmSendWhatsApp" href="${finalWhatsAppUrl}" target="_blank" class="btn-checkout-whatsapp" style="display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; text-decoration: none; padding: 15px 18px; font-size: 1.05rem; font-weight: 800; border-radius: 12px; background: #25d366; color: #ffffff; box-shadow: 0 6px 20px rgba(37, 211, 102, 0.45); margin-bottom: 10px; cursor: pointer; transition: transform 0.15s ease;">
          <span style="font-size: 1.35rem;">💬</span> (Confirm and Send to WhatsApp)
        </a>

        <div style="font-size: 0.78rem; color: #78716c; margin-bottom: 16px;">
          Store Owner: <strong>${ownerNumberFormatted}</strong> • Chat opens with your order details pre-typed
        </div>

        <button type="button" class="btn-luxury-secondary" style="width: 100%; padding: 10px; font-size: 0.88rem; border-radius: 8px; border: 1px solid #d6d3d1; background: #ffffff; color: #44403c; cursor: pointer; font-weight: 600;" onclick="document.getElementById('orderSuccessModal')?.classList.remove('active'); document.body.style.overflow = '';">
          Continue Browsing Store
        </button>
      </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Set up redirect on button click as well
    const btnWhatsApp = modal.querySelector('#btnConfirmSendWhatsApp');
    if (btnWhatsApp) {
      btnWhatsApp.addEventListener('click', () => {
        const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          window.location.href = finalWhatsAppUrl;
        }
      });
    }

    // Automatically trigger WhatsApp opening after 400ms
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setTimeout(() => {
      if (isMobile) {
        window.location.href = finalWhatsAppUrl;
      } else {
        const win = window.open(finalWhatsAppUrl, '_blank');
        if (!win || win.closed || typeof win.closed === 'undefined') {
          // If browser popup blocker triggered, button is right there on screen
        }
      }
    }, 450);
  }

  // Track Order Form
  const trackForm = document.getElementById('trackOrderForm');
  if (trackForm) {
    trackForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = document.getElementById('trackInput').value.trim();
      const box = document.getElementById('trackResultBox');
      if (!box) return;

      box.innerHTML = `<p style="color: #78716c;">Searching orders...</p>`;

      try {
        const res = await fetch(`/api/orders/track?query=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success && data.orders.length > 0) {
          box.innerHTML = data.orders.map(o => `
            <div style="background: #faf7f2; border: 1px solid var(--border-light); padding: 14px; border-radius: 6px; margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between;">
                <strong>#${o.id}</strong>
                <span style="font-weight: 700; color: var(--brand-burgundy);">${o.status}</span>
              </div>
              <div style="font-size: 0.85rem; color: #57534e; margin-top: 4px;">
                Total: ₹${o.total} • ${o.items.map(i => `${i.name} (${i.quantity}x)`).join(', ')}
              </div>
            </div>
          `).join('');
        } else {
          box.innerHTML = `<p style="color: #dc2626;">No orders found for "${q}".</p>`;
        }
      } catch (err) {
        box.innerHTML = `<p style="color: red;">Error tracking order.</p>`;
      }
    });
  }

  // Modal close buttons
  document.querySelectorAll('.btn-modal-close').forEach(b => {
    b.addEventListener('click', closeAllModals);
  });
}

function closeAllModals() {
  if (checkoutModal) checkoutModal.classList.remove('active');
  if (accountModal) accountModal.classList.remove('active');
  if (searchModal) searchModal.classList.remove('active');
  if (wishlistModal) wishlistModal.classList.remove('active');
  if (customerAuthModal) customerAuthModal.classList.remove('active');
  if (customerAddressModal) customerAddressModal.classList.remove('active');
  if (accountDropdownCard) accountDropdownCard.classList.remove('active');
  document.body.style.overflow = '';
}

// Wishlist Logic (Exact Menagaii Feature)
window.toggleWishlist = (productId, event) => {
  if (event) event.stopPropagation();
  const idx = storeState.wishlist.indexOf(productId);
  if (idx > -1) {
    storeState.wishlist.splice(idx, 1);
  } else {
    storeState.wishlist.push(productId);
  }
  saveWishlistToStorage();
  updateWishlistUI();
  renderProductsOnPages();
  if (wishlistModal && wishlistModal.classList.contains('active')) {
    renderWishlistModalItems();
  }
};

function updateWishlistUI() {
  if (storeState.products && storeState.products.length > 0 && Array.isArray(storeState.wishlist)) {
    const validIds = new Set(storeState.products.map(p => p.id));
    const origCount = storeState.wishlist.length;
    storeState.wishlist = storeState.wishlist.filter(id => validIds.has(id));
    if (storeState.wishlist.length !== origCount) {
      saveWishlistToStorage();
    }
  }

  const count = (storeState.wishlist || []).length;
  document.querySelectorAll('#wishlistBadge, #wishlistBadgeCount, #menuWishlistCount, .wishlist-badge-count').forEach(b => {
    b.textContent = count;
    b.style.display = count > 0 ? 'flex' : 'none';
  });
}

function openWishlistModal() {
  if (!wishlistModal) return;
  renderWishlistModalItems();
  wishlistModal.classList.add('active');
}

function renderWishlistModalItems() {
  const container = document.getElementById('wishlistItemsList');
  if (!container) return;

  const items = storeState.products.filter(p => storeState.wishlist.includes(p.id));
  if (items.length === 0) {
    const isLoggedIn = Boolean(storeState.customer);
    if (!isLoggedIn) {
      // Screenshot 1: Without Login
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 10px; color: #1f1f1f;">
          <div style="display: flex; justify-content: center; margin-bottom: 18px;">
            <svg viewBox="0 0 24 24" style="width: 58px; height: 52px; fill: none; stroke: #D4BCA7; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </div>
          <h4 style="font-family: 'Montserrat', sans-serif; font-size: 1.25rem; font-weight: 500; color: #1f1f1f; margin-bottom: 8px;">Your wishlist is empty</h4>
          <p style="font-family: 'Montserrat', sans-serif; font-size: 0.88rem; color: #8c827a; margin-bottom: 24px;">Please login to save your favourite snacks & treats.</p>
          <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn-wishlist-login-cta" style="height: 42px; padding: 0 24px; font-size: 0.8rem;" onclick="closeAllModals(); openCustomerAuthModal('login');">LOGIN</button>
            <a href="/shop.html" class="btn-wishlist-explore-cta" style="height: 42px; padding: 0 24px; font-size: 0.8rem;" onclick="closeAllModals()">EXPLORE COLLECTION</a>
          </div>
        </div>
      `;
    } else {
      // Screenshot 2: With Login
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 10px; color: #1f1f1f;">
          <div style="display: flex; justify-content: center; margin-bottom: 18px;">
            <svg viewBox="0 0 24 24" style="width: 58px; height: 52px; fill: none; stroke: #D4BCA7; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </div>
          <h4 style="font-family: 'Montserrat', sans-serif; font-size: 1.25rem; font-weight: 500; color: #1f1f1f; margin-bottom: 8px;">Your wishlist is empty</h4>
          <p style="font-family: 'Montserrat', sans-serif; font-size: 0.88rem; color: #8c827a; margin-bottom: 24px;">Save your favourite snacks and teas here and come back to them anytime.</p>
          <div style="display: flex; justify-content: center;">
            <a href="/shop.html" class="btn-wishlist-explore-cta" style="height: 42px; padding: 0 28px; font-size: 0.8rem;" onclick="closeAllModals()">EXPLORE COLLECTION</a>
          </div>
        </div>
      `;
    }
    return;
  }

  container.innerHTML = items.map(p => `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--border-light);">
      <img src="${p.image}" alt="${p.name}" style="width: 52px; height: 52px; object-fit: cover; border-radius: 6px;" onerror="this.src='/images/varkey.jpg'">
      <div style="flex-grow: 1;">
        <h4 style="font-family: var(--font-serif); font-size: 1rem; font-weight: 700; color: #1c1917;">${p.name}</h4>
        <span style="font-size: 0.82rem; color: var(--brand-primary); font-weight: 700;">₹${p.price}</span>
        <span style="font-size: 0.74rem; color: #78716c;"> / ${p.unit}</span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button type="button" class="btn-add-cart" style="padding: 6px 14px; font-size: 0.78rem;" onclick="addToCart('${p.id}')">
          Add 👜
        </button>
        <button type="button" style="background: none; border: none; cursor: pointer; color: #ef4444; font-size: 1.15rem; padding: 4px 8px;" onclick="promptRemoveWishlistItem('${p.id}', event)" title="Remove">
          ✕
        </button>
      </div>
    </div>
  `).join('');
}

// =========================================================
// CUSTOMER PROFILE & AUTHENTICATION (REGISTER / LOGIN & OTP)
// =========================================================

// =========================================================
// PREMIUM AUTHENTICATION CONFIRMATION MODALS (LOGIN, REGISTER, LOGOUT)
// =========================================================

let authConfirmRedirectTimeout = null;

function ensureAuthConfirmOverlay() {
  let overlay = document.getElementById('authConfirmOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'authConfirmOverlay';
    overlay.className = 'auth-confirm-overlay';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        const card = overlay.querySelector('.auth-confirm-card');
        if (card && !card.classList.contains('auth-type-login-success')) {
          closeAuthConfirmationModal();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) {
        const card = overlay.querySelector('.auth-confirm-card');
        if (card && !card.classList.contains('auth-type-login-success')) {
          closeAuthConfirmationModal();
        }
      }
    });
  }
  return overlay;
}

function closeAuthConfirmationModal() {
  if (authConfirmRedirectTimeout) {
    clearTimeout(authConfirmRedirectTimeout);
    authConfirmRedirectTimeout = null;
  }
  const overlay = document.getElementById('authConfirmOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

// 1. LOGOUT CONFIRMATION POPUP MODAL
function showLogoutConfirmationModal(options = {}) {
  const overlay = ensureAuthConfirmOverlay();
  const custName = options.name || (storeState?.customer?.name) || 'Valued Customer';
  const custPhone = options.phone || (storeState?.customer?.phone) || '';

  overlay.innerHTML = `
    <div class="auth-confirm-card auth-type-logout-confirm" role="dialog" aria-modal="true" aria-labelledby="authLogoutTitle">
      <div class="auth-confirm-icon-wrap">🚪</div>
      <span class="auth-confirm-badge">Account Security</span>
      <h3 class="auth-confirm-title" id="authLogoutTitle">Confirm Sign Out</h3>
      <p class="auth-confirm-desc">
        Are you sure you want to log out of your session? You will need your mobile OTP verification to log back in.
      </p>
      <div class="auth-confirm-user-chip">
        <span>👤 <strong>${custName}</strong></span>
        ${custPhone ? `<span>&bull;</span><span>📱 +91 ${custPhone}</span>` : ''}
      </div>
      <div class="auth-confirm-actions">
        <button type="button" class="btn-auth-cancel" id="btnAuthCancelLogout">
          Stay Logged In
        </button>
        <button type="button" class="btn-auth-confirm" id="btnAuthConfirmLogout">
          <span>Log Out</span> 🚪
        </button>
      </div>
    </div>
  `;

  overlay.classList.add('active');

  const btnCancel = document.getElementById('btnAuthCancelLogout');
  const btnConfirm = document.getElementById('btnAuthConfirmLogout');

  if (btnCancel) {
    btnCancel.onclick = () => {
      closeAuthConfirmationModal();
      if (typeof options.onCancel === 'function') options.onCancel();
    };
    btnCancel.focus();
  }

  if (btnConfirm) {
    btnConfirm.onclick = () => {
      closeAuthConfirmationModal();
      if (typeof options.onConfirm === 'function') options.onConfirm();
    };
  }
}

// 2. LOGOUT SUCCESS CONFIRMATION POPUP MODAL
function showLogoutSuccessModal(options = {}) {
  const overlay = ensureAuthConfirmOverlay();

  overlay.innerHTML = `
    <div class="auth-confirm-card auth-type-logout-success" role="dialog" aria-modal="true">
      <div class="auth-confirm-icon-wrap">✓</div>
      <span class="auth-confirm-badge">Session Ended</span>
      <h3 class="auth-confirm-title">Logged Out Successfully</h3>
      <p class="auth-confirm-desc">
        You have safely signed out of your account. You can log back in anytime using your registered mobile number and OTP.
      </p>
      <button type="button" class="btn-auth-success" id="btnAuthSuccessDone">
        Continue 🛍️
      </button>
    </div>
  `;

  overlay.classList.add('active');

  const btnDone = document.getElementById('btnAuthSuccessDone');
  if (btnDone) {
    btnDone.onclick = () => {
      closeAuthConfirmationModal();
      if (typeof options.onDone === 'function') options.onDone();
    };
    btnDone.focus();
  }
}

// 3. LOGIN SUCCESS CONFIRMATION POPUP MODAL
function showLoginSuccessModal(options = {}) {
  const overlay = ensureAuthConfirmOverlay();
  const customer = options.customer || {};
  const custName = customer.name || 'Valued Customer';
  const custPhone = customer.phone || '';
  const redirectUrl = options.redirectUrl || null;

  overlay.innerHTML = `
    <div class="auth-confirm-card auth-type-login-success" role="dialog" aria-modal="true">
      <div class="auth-confirm-icon-wrap">🎉</div>
      <span class="auth-confirm-badge">Authentication Verified</span>
      <h3 class="auth-confirm-title">Login Successful!</h3>
      <p class="auth-confirm-desc">
        Welcome back, <strong>${custName}</strong>! Your account has been authenticated via Nilgiris 2FA Mobile OTP.
      </p>
      <div class="auth-confirm-user-chip">
        <span>✓ <strong>Verified Customer</strong></span>
        ${custPhone ? `<span>&bull;</span><span>📱 +91 ${custPhone}</span>` : ''}
      </div>
      <div class="auth-redirect-progress-bar">
        <div class="auth-redirect-progress-fill" id="authLoginProgressBar"></div>
      </div>
      <div style="font-size: 0.82rem; color: #64748b; margin: 10px 0 18px;">
        Redirecting you now...
      </div>
      <button type="button" class="btn-auth-primary" id="btnAuthLoginContinue">
        Continue to Store 🛍️
      </button>
    </div>
  `;

  overlay.classList.add('active');

  setTimeout(() => {
    const bar = document.getElementById('authLoginProgressBar');
    if (bar) bar.style.width = '100%';
  }, 50);

  const proceed = () => {
    closeAuthConfirmationModal();
    if (typeof options.onProceed === 'function') {
      options.onProceed();
    } else if (redirectUrl) {
      window.location.href = redirectUrl;
    } else {
      window.location.href = '/';
    }
  };

  const btnContinue = document.getElementById('btnAuthLoginContinue');
  if (btnContinue) {
    btnContinue.onclick = proceed;
    btnContinue.focus();
  }

  authConfirmRedirectTimeout = setTimeout(proceed, 1800);
}

// 4. REGISTRATION SUCCESS CONFIRMATION POPUP MODAL
function showRegisterSuccessModal(options = {}) {
  const overlay = ensureAuthConfirmOverlay();
  const customer = options.customer || {};
  const custName = customer.name || 'New Customer';
  const custPhone = customer.phone || '';
  const custAddress = customer.address || '';
  const custCity = customer.city || 'Ooty';
  const custPincode = customer.pincode || '643001';

  overlay.innerHTML = `
    <div class="auth-confirm-card auth-type-register-success" role="dialog" aria-modal="true">
      <div class="auth-confirm-icon-wrap">🎉</div>
      <span class="auth-confirm-badge">Account Created</span>
      <h3 class="auth-confirm-title">Registration Successful!</h3>
      <p class="auth-confirm-desc">
        Welcome to Ooty Hills Nilgiris Heritage, <strong>${custName}</strong>! Your customer account has been created.
      </p>
      <div class="auth-confirm-details-box">
        <div>📱 <strong>Registered Mobile:</strong> +91 ${custPhone}</div>
        ${custAddress ? `<div style="margin-top: 5px;">📍 <strong>Delivery Address:</strong> ${custAddress}, ${custCity} - ${custPincode}</div>` : ''}
        <div style="margin-top: 6px; color: #059669; font-weight: 600; font-size: 0.82rem;">✓ Instant 2FA Mobile OTP Ready</div>
      </div>
      <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 20px; line-height: 1.45;">
        Please proceed to log in with your mobile OTP to access your bag, saved addresses, and past orders.
      </p>
      <button type="button" class="btn-auth-primary" id="btnAuthRegProceed">
        Proceed to Login & Get OTP 📲
      </button>
    </div>
  `;

  overlay.classList.add('active');

  const btnProceed = document.getElementById('btnAuthRegProceed');
  if (btnProceed) {
    btnProceed.onclick = () => {
      closeAuthConfirmationModal();
      if (typeof options.onProceed === 'function') options.onProceed();
    };
    btnProceed.focus();
  }
}

// Expose globally to window
window.ensureAuthConfirmOverlay = ensureAuthConfirmOverlay;
window.closeAuthConfirmationModal = closeAuthConfirmationModal;
window.showLogoutConfirmationModal = showLogoutConfirmationModal;
window.showLogoutSuccessModal = showLogoutSuccessModal;
window.showLoginSuccessModal = showLoginSuccessModal;
window.showRegisterSuccessModal = showRegisterSuccessModal;

function logoutCustomer() {
  if (!storeState.customer) return;
  showLogoutConfirmationModal({
    name: storeState.customer.name,
    phone: storeState.customer.phone,
    onConfirm: () => {
      window.switchCustomerSession(null);
      closeAllModals();
      showLogoutSuccessModal({
        onDone: () => {
          if (window.location.pathname.includes('account')) {
            if (typeof initAccountPortalPage === 'function') initAccountPortalPage();
          }
        }
      });
    }
  });
}

function updateCustomerAccountUI() {
  const headerName = document.getElementById('accountHeaderName');
  const headerSub = document.getElementById('accountHeaderSub');
  const authRowText = document.getElementById('authRowText');
  const authRowIcon = document.getElementById('authRowIcon');
  const authBtn = document.getElementById('menuActionAuth');
  const wishlistCountBadge = document.getElementById('menuWishlistCount');

  // Update dropdown wishlist badge
  if (wishlistCountBadge) {
    wishlistCountBadge.textContent = storeState.wishlist.length;
    wishlistCountBadge.style.display = storeState.wishlist.length > 0 ? 'inline-block' : 'none';
  }

  if (storeState.customer) {
    if (headerName) headerName.textContent = storeState.customer.name;
    if (headerSub) headerSub.textContent = '+91 ' + storeState.customer.phone;
    if (authRowText) authRowText.textContent = 'Logout';
    if (authBtn) authBtn.classList.add('logout-state');
    if (authRowIcon) {
      authRowIcon.innerHTML = `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>`;
    }

    // Prefill checkout inputs if present
    const custName = document.getElementById('custName');
    const custPhone = document.getElementById('custPhone');
    const custAddress = document.getElementById('custAddress');
    const custCity = document.getElementById('custCity');
    const custPincode = document.getElementById('custPincode');
    if (custName && !custName.value) custName.value = storeState.customer.name;
    if (custPhone && !custPhone.value) custPhone.value = storeState.customer.phone;
    if (custAddress && !custAddress.value && storeState.customer.address) custAddress.value = storeState.customer.address;
    if (custCity && !custCity.value && storeState.customer.city) custCity.value = storeState.customer.city;
    if (custPincode && !custPincode.value && storeState.customer.pincode) custPincode.value = storeState.customer.pincode;
  } else {
    if (headerName) headerName.textContent = 'My Account';
    if (headerSub) headerSub.textContent = 'Guest Customer';
    if (authRowText) authRowText.textContent = 'Login';
    if (authBtn) authBtn.classList.remove('logout-state');
    if (authRowIcon) {
      authRowIcon.innerHTML = `<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line>`;
    }
  }
}

// ---------------------------------------------------------
// ---------------------------------------------------------
// SIMULATED REAL-TIME SMS / WHATSAPP PUSH NOTIFICATION
// ---------------------------------------------------------
function showOtpToast(phone, otp, mode = 'login', whatsappOtpUrl = null, customerName = '') {
  let toast = document.getElementById('otpSmsBanner');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'otpSmsBanner';
    toast.className = 'otp-sms-banner';
    document.body.appendChild(toast);
  }

  const isLocalDev = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' || 
                     window.location.hostname === '' ||
                     window.location.hostname.includes('192.168.') ||
                     window.location.hostname.endsWith('.local') ||
                     window.location.search.includes('dev=1');

  // If live production, automatically open WhatsApp
  if (!isLocalDev && whatsappOtpUrl) {
    try {
      window.open(whatsappOtpUrl, '_blank');
    } catch (e) {}
  }

  toast.innerHTML = `
    <div class="otp-sms-icon">💬</div>
    <div class="otp-sms-content">
      <div class="otp-sms-header">
        <span class="otp-sms-title">📱 Hill Mades OTP Verification</span>
        <span class="otp-sms-time">Just now</span>
      </div>
      <div class="otp-sms-body">
        Verification OTP for <strong>+91 ${phone}</strong> ${customerName ? `(${customerName})` : ''} is: <br>
        <span class="otp-code-highlight" style="font-family: monospace; font-size: 1.4rem; font-weight: 800; background: #eab308; color: #1c1917; padding: 2px 10px; border-radius: 6px; letter-spacing: 3px; display: inline-block; margin-top: 4px;">${otp}</span>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
        <button type="button" class="otp-sms-action-btn" id="btnAutoFillOtpBanner" style="background: #22c55e; color: white; border: none; font-weight: 700; font-size: 0.78rem; padding: 6px 12px; border-radius: 6px; cursor: pointer;">
          ⚡ Auto-Fill Code
        </button>
        ${whatsappOtpUrl ? `
          <a href="${whatsappOtpUrl}" target="_blank" style="background: #25D366; color: white; font-weight: 700; font-size: 0.76rem; border-radius: 6px; padding: 6px 12px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
            💬 Open in WhatsApp
          </a>
        ` : ''}
        <button type="button" style="background: rgba(255,255,255,0.15); border: none; color: white; font-size: 0.74rem; border-radius: 6px; padding: 6px 12px; cursor: pointer;" onclick="document.getElementById('otpSmsBanner')?.classList.remove('show')">
          Dismiss
        </button>
      </div>
    </div>
  `;

  // Animate in
  setTimeout(() => toast.classList.add('show'), 50);

  // Auto-fill listener
  const autoBtn = document.getElementById('btnAutoFillOtpBanner');
  if (autoBtn) {
    autoBtn.onclick = () => {
      quickFillPortalOtp(otp);
      toast.classList.remove('show');
    };
  }

  // Auto-hide after 25s
  if (window._otpToastTimer) clearTimeout(window._otpToastTimer);
  window._otpToastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 25000);
}

// ---------------------------------------------------------
// CUSTOMER AUTH MODAL (REGISTER FIRST -> THEN LOGIN WITH REAL OTP)
// ---------------------------------------------------------
let otpResendTimerInterval = null;

function openCustomerAuthModal(initialTab = 'register', prefillPhone = '') {
  closeAllModals();
  const target = initialTab === 'register' ? '/login.html?tab=signup' : '/login.html';
  const param = prefillPhone ? `${target.includes('?') ? '&' : '?'}phone=${encodeURIComponent(prefillPhone)}` : '';
  window.location.href = target + param;
}

function renderAuthStep1(activeTab = 'register', prefillPhone = '') {
  const container = document.getElementById('customerAuthModalBody');
  const title = document.getElementById('customerAuthTitle');
  if (title) title.textContent = activeTab === 'register' ? 'Sign Up (New Customer)' : 'Customer Login';
  if (!container) return;

  container.innerHTML = `
    <div class="auth-tabs-wrapper">
      <button type="button" class="auth-tab-btn ${activeTab === 'register' ? 'active' : ''}" id="tabBtnRegister">
        ✨ New Customer (Sign Up)
      </button>
      <button type="button" class="auth-tab-btn ${activeTab === 'login' ? 'active' : ''}" id="tabBtnLogin">
        🔑 Returning Customer (Login)
      </button>
    </div>

    ${activeTab === 'register' ? `
      <form id="authRegisterForm">
        <div style="background: #fdfbf7; border: 1px solid var(--border-light); border-radius: 8px; padding: 12px; margin-bottom: 14px;">
          <p style="font-size: 0.84rem; color: #57534e; margin: 0; line-height: 1.45;">
            🌿 <strong>Step 1: Create your Customer Account</strong> with your delivery details below. Once registered, you will log in using a <strong>real OTP sent directly to your mobile number</strong>.
          </p>
        </div>

        <div class="form-group">
          <label class="form-label" for="regName">Your Full Name *</label>
          <input type="text" id="regName" class="form-control" placeholder="Full Name (Letters only)" maxlength="50" pattern="[a-zA-Z\s.'-]{2,50}" title="Letters only, at least 2 characters" required autofocus>
        </div>

        <div class="form-group">
          <label class="form-label" for="regPhone">WhatsApp Mobile Number *</label>
          <div style="position: relative;">
            <span style="position: absolute; left: 12px; top: 11px; font-weight: 700; color: #78716c; font-size: 0.92rem;">+91</span>
            <input type="tel" id="regPhone" class="form-control" style="padding-left: 48px;" placeholder="9876543210 (10 digits)" maxlength="10" pattern="[6-9][0-9]{9}" inputmode="numeric" value="${prefillPhone || ''}" required>
          </div>
          <span class="auth-subnote">This mobile number will be used to log in and receive your OTP.</span>
        </div>

        <div class="form-group">
          <label class="form-label" for="regAddress">Delivery Address (House / Street / Area) *</label>
          <textarea id="regAddress" class="form-control" rows="2" placeholder="e.g. No. 12, Rose Garden Street, Charring Cross" required></textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 10px;">
          <div class="form-group">
            <label class="form-label" for="regCity">City / Town *</label>
            <input type="text" id="regCity" class="form-control" placeholder="City / Town" maxlength="40" pattern="[a-zA-Z\s.'-]{2,40}" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="regPincode">Pincode *</label>
            <input type="tel" id="regPincode" class="form-control" placeholder="Pincode (6 digits)" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="regLandmark">Landmark (Optional)</label>
          <input type="text" id="regLandmark" class="form-control" placeholder="Near Botanical Garden, Lake, etc.">
        </div>

        <button type="submit" class="btn-menagaii-cta" id="btnRegisterSubmit" style="width: 100%; padding: 14px; font-size: 0.96rem; margin-top: 8px;">
          Create Account & Proceed to Login ➡️
        </button>

        <p style="text-align: center; font-size: 0.85rem; margin-top: 14px; color: #78716c;">
          Already have an account? 
          <a href="javascript:void(0)" id="linkSwitchToLogin" style="color: var(--brand-primary); font-weight: 700; text-decoration: underline;">
            Click here to Login
          </a>
        </p>
      </form>
    ` : `
      <form id="authLoginForm">
        <div style="background: #faf8f5; border: 1px solid var(--border-light); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
          <p style="font-size: 0.86rem; color: #57534e; margin: 0; line-height: 1.5;">
            🌿 <strong>Step 2: Log in with Real OTP</strong>. Enter your registered mobile number below to receive your instant verification OTP and access your past orders and addresses.
          </p>
        </div>

        <div class="form-group">
          <label class="form-label" for="loginPhone">WhatsApp Mobile Number *</label>
          <div style="position: relative;">
            <span style="position: absolute; left: 12px; top: 11px; font-weight: 700; color: #78716c; font-size: 0.92rem;">+91</span>
            <input type="tel" id="loginPhone" class="form-control" style="padding-left: 48px;" placeholder="9876543210 (10 digits)" maxlength="10" pattern="[6-9][0-9]{9}" inputmode="numeric" value="${prefillPhone || ''}" required autofocus>
          </div>
          <span class="auth-subnote">A 4-digit verification OTP will be sent to this number.</span>
        </div>

        <button type="submit" class="btn-menagaii-cta" id="btnSendLoginOtp" style="width: 100%; padding: 14px; font-size: 0.96rem; margin-top: 10px;">
          Send Login OTP to Mobile 📲
        </button>

        <p style="text-align: center; font-size: 0.85rem; margin-top: 14px; color: #78716c;">
          New customer? 
          <a href="javascript:void(0)" id="linkSwitchToReg" style="color: var(--brand-primary); font-weight: 700; text-decoration: underline;">
            Sign up / Register first
          </a>
        </p>
      </form>
    `}
  `;

  // Attach real-time input filters
  const modalName = document.getElementById('regName');
  if (modalName) modalName.addEventListener('input', e => { e.target.value = e.target.value.replace(/[^a-zA-Z\s.'-]/g, ''); });
  const modalPhone = document.getElementById('regPhone');
  if (modalPhone) modalPhone.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
  const modalLogPhone = document.getElementById('loginPhone');
  if (modalLogPhone) modalLogPhone.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
  const modalCity = document.getElementById('regCity');
  if (modalCity) modalCity.addEventListener('input', e => { e.target.value = e.target.value.replace(/[^a-zA-Z\s.'-]/g, ''); });
  const modalPin = document.getElementById('regPincode');
  if (modalPin) modalPin.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });

  // Bind Tab Switching
  document.getElementById('tabBtnRegister')?.addEventListener('click', () => renderAuthStep1('register', prefillPhone));
  document.getElementById('tabBtnLogin')?.addEventListener('click', () => renderAuthStep1('login', prefillPhone));
  document.getElementById('linkSwitchToLogin')?.addEventListener('click', () => renderAuthStep1('login', prefillPhone));
  document.getElementById('linkSwitchToReg')?.addEventListener('click', () => renderAuthStep1('register', prefillPhone));

  // 1. Handle Registration Submission (Creates Account -> Prompts Login)
  const regForm = document.getElementById('authRegisterForm');
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (document.getElementById('regName')?.value || '').trim();
      const phone = (document.getElementById('regPhone')?.value || '').replace(/\D/g, '').slice(0, 10);
      const address = (document.getElementById('regAddress')?.value || '').trim();
      const city = (document.getElementById('regCity')?.value || '').trim();
      const pincode = (document.getElementById('regPincode')?.value || '').trim();
      const landmark = (document.getElementById('regLandmark')?.value || '').trim();

      if (!name || name.length < 2 || !/^[a-zA-Z\s.'-]+$/.test(name)) {
        alert('Please enter a valid full name using letters only (minimum 2 characters).');
        document.getElementById('regName')?.focus();
        return;
      }

      if (!phone || phone.length !== 10 || !/^[6-9]\d{9}$/.test(phone)) {
        alert('Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.');
        document.getElementById('regPhone')?.focus();
        return;
      }

      if (!address || address.length < 5) {
        alert('Please enter your complete delivery address (minimum 5 characters).');
        document.getElementById('regAddress')?.focus();
        return;
      }

      if (!city || city.length < 2 || !/^[a-zA-Z\s.'-]+$/.test(city)) {
        alert('Please enter your delivery city or town (letters only).');
        document.getElementById('regCity')?.focus();
        return;
      }

      if (!pincode || !/^\d{6}$/.test(pincode)) {
        alert('Please enter a valid 6-digit postal pincode.');
        document.getElementById('regPincode')?.focus();
        return;
      }

      const submitBtn = document.getElementById('btnRegisterSubmit');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating Account...';
      }

      try {
        const res = await fetch('/api/customer/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, address, city, pincode, landmark })
        });
        const data = await res.json();

        if (data.success) {
          showRegisterSuccessModal({
            customer: data.customer || { name, phone, address, city, pincode },
            onProceed: () => {
              renderAuthStep1('login', phone);
            }
          });
        } else if (data.alreadyRegistered) {
          showRegisterSuccessModal({
            customer: { name, phone, address, city, pincode },
            onProceed: () => {
              renderAuthStep1('login', phone);
            }
          });
        } else {
          alert(data.message || 'Error creating account');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account & Proceed to Login ➡️';
          }
        }
      } catch (err) {
        alert('Could not connect to server to register account. Please check connection.');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account & Proceed to Login ➡️';
        }
      }
    });
  }

  // 2. Handle Login Submission (Dispatches Real OTP to Customer Mobile)
  const logForm = document.getElementById('authLoginForm');
  if (logForm) {
    logForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('loginPhone').value.replace(/\D/g, '').slice(-10);

      if (phone.length !== 10) {
        alert('Please enter a valid 10-digit mobile number');
        return;
      }

      const submitBtn = document.getElementById('btnSendLoginOtp');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending OTP...';
      }

      try {
        const res = await fetch('/api/customer/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await res.json();

        if (data.notRegistered) {
          alert(data.message || `Mobile number +91 ${phone} is not registered yet. Please click Sign Up to create your account first!`);
          // Auto switch to register tab and prefill phone!
          renderAuthStep1('register', phone);
          return;
        }

        if (data.success) {
          window._lastOtpToken = data.otpToken || '';
          window._lastOtpCustomer = data.customer || null;
          // Show realistic carrier/WhatsApp SMS toast banner
          showOtpToast(phone, data.otp, 'login', data.whatsappOtpUrl, data.customerName);
          // Render Step 2: 6-digit input screen
          renderAuthStep2(phone, data.otp, data.whatsappOtpUrl, data.customerName);
        } else {
          alert(data.message || 'Error sending OTP');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Login OTP to Mobile 📲';
          }
        }
      } catch (err) {
        alert('Could not connect to server to send OTP. Please check connection.');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Login OTP to Mobile 📲';
        }
      }
    });
  }
}

// ---------------------------------------------------------
// STEP 2: VERIFY REAL OTP
// ---------------------------------------------------------
function renderAuthStep2(phone, otp, whatsappOtpUrl, customerName) {
  const container = document.getElementById('customerAuthModalBody');
  const title = document.getElementById('customerAuthTitle');
  if (title) title.textContent = 'Verify Mobile Number';
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; margin-bottom: 16px;">
      <div style="font-size: 2.8rem; margin-bottom: 6px;">📲</div>
      <h4 style="font-family: var(--font-serif); font-size: 1.25rem; color: #1c1917; margin-bottom: 4px;">
        Enter Verification Code
      </h4>
      <p style="font-size: 0.88rem; color: #57534e; margin: 0;">
        We have sent a 6-digit OTP to <strong>+91 ${phone}</strong> ${customerName ? `for <strong>${customerName}</strong>` : ''}
        <br>
        <a href="javascript:void(0)" id="btnChangePhone" style="color: var(--brand-primary); font-size: 0.82rem; font-weight: 700; text-decoration: underline;">
          ← Change Mobile Number
        </a>
      </p>
    </div>

    ${whatsappOtpUrl ? `
      <div style="margin-bottom: 16px;">
        <a href="${whatsappOtpUrl}" target="_blank" class="btn-order-wa" style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; text-decoration: none; padding: 12px 14px; font-weight: 700; border-radius: 8px; font-size: 0.92rem; background: #25D366; color: #ffffff; box-shadow: 0 4px 12px rgba(37,211,102,0.25);">
          <span style="font-size: 1.15rem;">💬</span> Open WhatsApp to Receive OTP Message
        </a>
      </div>
    ` : ''}

    <!-- Quick Demo Testing Code Helper -->
    <div style="background: #fefce8; border: 1.5px dashed #eab308; border-radius: 10px; padding: 10px; margin-bottom: 18px; text-align: center; cursor: pointer;" onclick="quickFillOtp('${otp}')" title="Click to Auto-Fill">
      <span style="font-size: 0.74rem; font-weight: 700; color: #854d0e; text-transform: uppercase; letter-spacing: 0.5px; display: block;">
        Simulated SMS / WhatsApp OTP (Click to Auto-Fill):
      </span>
      <span style="font-family: monospace; font-size: 1.45rem; font-weight: 800; color: #1c1917; letter-spacing: 4px;">
        ${otp}
      </span>
    </div>

    <form id="otpVerifyForm">
      <div class="otp-boxes-wrapper" style="display: flex; justify-content: center; gap: 8px;">
        <input type="tel" class="otp-digit-input" id="otpDigit0" maxlength="1" pattern="[0-9]" inputmode="numeric" autofocus required>
        <input type="tel" class="otp-digit-input" id="otpDigit1" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
        <input type="tel" class="otp-digit-input" id="otpDigit2" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
        <input type="tel" class="otp-digit-input" id="otpDigit3" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
        <input type="tel" class="otp-digit-input" id="otpDigit4" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
        <input type="tel" class="otp-digit-input" id="otpDigit5" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
      </div>

      <button type="submit" class="btn-menagaii-cta" id="btnVerifyOtpSubmit" style="width: 100%; padding: 14px; font-size: 1rem; margin-top: 14px;">
        Verify & Access Account 🔓
      </button>

      <div class="otp-meta-row" style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
        <span id="otpCountdownText" style="font-size: 0.82rem; color: #78716c;">Resend code in <strong id="otpTimerSeconds">30</strong>s</span>
        <button type="button" class="otp-resend-btn" id="btnResendOtp" style="background: none; border: none; color: var(--brand-primary); font-size: 0.82rem; font-weight: 700; cursor: pointer;" disabled>
          Resend OTP
        </button>
      </div>
    </form>
  `;

  // Bind change phone
  document.getElementById('btnChangePhone')?.addEventListener('click', () => {
    if (otpResendTimerInterval) clearInterval(otpResendTimerInterval);
    renderAuthStep1('login', phone);
  });

  // Setup 6 digit boxes auto-advance
  const inputs = [
    document.getElementById('otpDigit0'),
    document.getElementById('otpDigit1'),
    document.getElementById('otpDigit2'),
    document.getElementById('otpDigit3'),
    document.getElementById('otpDigit4'),
    document.getElementById('otpDigit5')
  ];

  inputs.forEach((inp, idx) => {
    if (!inp) return;
    inp.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val ? val[0] : '';
      if (val && idx < 5) {
        inputs[idx + 1].focus();
        inputs[idx + 1].select();
      }
    });

    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && idx > 0) {
        inputs[idx - 1].focus();
      }
    });

    inp.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      for (let i = 0; i < pasteData.length; i++) {
        if (inputs[i]) inputs[i].value = pasteData[i];
      }
      if (pasteData.length === 6) {
        inputs[5].focus();
        document.getElementById('otpVerifyForm')?.dispatchEvent(new Event('submit'));
      }
    });
  });

  // Auto pre-fill if available
  if (otp && otp.length === 6) {
    for (let i = 0; i < 6; i++) {
      if (inputs[i]) inputs[i].value = otp[i];
    }
  }

  inputs[0]?.focus();

  // Start 30s Countdown
  startOtpResendTimer(phone, customerName);

  // Bind Form Submit
  const verifyForm = document.getElementById('otpVerifyForm');
  if (verifyForm) {
    verifyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = inputs.map(i => i.value).join('');
      if (code.length !== 6) {
        alert('Please enter all 6 digits of the verification code');
        return;
      }
      verifyCustomerOtp(phone, code);
    });
  }
}

function quickFillOtp(otp) {
  const str = otp.toString().trim();
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById('otpDigit' + i);
    if (el) el.value = str[i] || '';
  }
  document.getElementById('btnVerifyOtpSubmit')?.focus();
}

function startOtpResendTimer(phone, customerName) {
  if (otpResendTimerInterval) clearInterval(otpResendTimerInterval);
  let seconds = 30;
  const timerSpan = document.getElementById('otpTimerSeconds');
  const resendBtn = document.getElementById('btnResendOtp');
  const countdownText = document.getElementById('otpCountdownText');

  otpResendTimerInterval = setInterval(() => {
    seconds--;
    if (timerSpan) timerSpan.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(otpResendTimerInterval);
      if (countdownText) countdownText.textContent = "Didn't receive code?";
      if (resendBtn) {
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend OTP 📲';
        resendBtn.onclick = async () => {
          resendBtn.disabled = true;
          resendBtn.textContent = 'Resending...';
          try {
            const res = await fetch('/api/customer/otp/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone })
            });
            const data = await res.json();
            if (data.success) {
              window._lastOtpToken = data.otpToken || '';
              showOtpToast(phone, data.otp, 'login', data.whatsappOtpUrl, data.customerName);
              renderAuthStep2(phone, data.otp, data.whatsappOtpUrl, data.customerName);
            } else {
              alert(data.message || 'Error resending OTP');
              resendBtn.disabled = false;
            }
          } catch (e) {
            alert('Connection error resending OTP');
            resendBtn.disabled = false;
          }
        };
      }
    }
  }, 1000);
}

async function verifyCustomerOtp(phone, otp) {
  const submitBtn = document.getElementById('btnVerifyOtpSubmit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying Code...';
  }

  try {
    const res = await fetch('/api/customer/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        phone, 
        otp,
        otpToken: window._lastOtpToken || '',
        customer: window._lastOtpCustomer || null
      })
    });

    const data = await res.json();
    if (data.success && data.customer) {
      window.switchCustomerSession(data.customer);
      closeAllModals();

      // Dismiss any OTP banner
      document.getElementById('otpSmsBanner')?.classList.remove('show');

      showLoginSuccessModal({
        customer: data.customer,
        onProceed: () => {
          openOrdersModal(phone);
        }
      });
    } else {
      alert(data.message || 'Invalid OTP code. Please try again.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verify & Access Account 🔓';
      }
    }
  } catch (err) {
    alert('Server communication error during verification.');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verify & Access Account 🔓';
    }
  }
}

// =========================================================
// MY ORDERS MODAL (VIEW CUSTOMER ORDERS & REORDERING)
// =========================================================
async function openOrdersModal(lookupPhone = null) {
  closeAllModals();
  if (!accountModal) return;

  const title = document.getElementById('myOrdersModalTitle');
  if (title) title.textContent = 'My Orders 📦';

  const container = document.getElementById('ordersModalBody');
  if (!container) return;

  const phone = lookupPhone || (storeState.customer ? storeState.customer.phone : null);

  if (phone) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: #78716c;">
        <div style="font-size: 2rem; margin-bottom: 8px;">⏳</div>
        <p>Loading orders for +91 ${phone}...</p>
      </div>
    `;
    accountModal.classList.add('active');

    try {
      const res = await fetch(`/api/customer/orders?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      
      const portalBannerHtml = `
        <div style="background: linear-gradient(135deg, #0f172a, #1e293b); color: #ffffff; border-radius: 12px; padding: 12px 16px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <div>
            <div style="font-size: 0.72rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Ooty Hills IT Customer Portal</div>
            <div style="font-size: 0.88rem; font-weight: 700; color: #ffffff;">Real-Time Dispatch & Order History</div>
          </div>
          <a href="/account" style="background: rgba(255,255,255,0.12); color: #ffffff; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 6px 12px; font-size: 0.78rem; font-weight: 700; text-decoration: none; white-space: nowrap;">
            Open Full Portal ↗
          </a>
        </div>
      `;

      if (data.success && data.orders) {
        container.innerHTML = portalBannerHtml;
        const listContainer = document.createElement('div');
        container.appendChild(listContainer);
        renderOrderCards(data.orders, listContainer, phone);
      } else {
        container.innerHTML = portalBannerHtml;
        const listContainer = document.createElement('div');
        container.appendChild(listContainer);
        renderOrderCards([], listContainer, phone);
      }
    } catch (err) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px; color: #dc2626;">
          <p>Error loading your orders. Please try again.</p>
        </div>
      `;
    }
  } else {
    // Guest customer view
    container.innerHTML = `
      <div style="background: #faf8f5; border: 1px solid var(--border-light); border-radius: 12px; padding: 22px; text-align: center; margin-bottom: 24px;">
        <div style="font-size: 2.6rem; margin-bottom: 6px;">📦</div>
        <h4 style="font-family: var(--font-serif); font-size: 1.3rem; color: #1c1917; margin-bottom: 6px;">
          View Your Order History
        </h4>
        <p style="font-size: 0.9rem; color: #57534e; margin-bottom: 16px; line-height: 1.5;">
          Log in with your WhatsApp mobile number to automatically track all your past orders, delivery addresses, and dispatch status.
        </p>
        <button type="button" class="btn-menagaii-cta" style="padding: 12px 24px; font-size: 0.92rem;" onclick="closeAllModals(); openCustomerAuthModal('login');">
          Login / Register with OTP 📲
        </button>
      </div>

      <div style="display: flex; align-items: center; gap: 12px; margin: 20px 0; color: #a8a29e; font-size: 0.8rem; font-weight: 700;">
        <div style="flex-grow: 1; height: 1px; background: var(--border-light);"></div>
        <span>OR TRACK BY ORDER ID / PHONE</span>
        <div style="flex-grow: 1; height: 1px; background: var(--border-light);"></div>
      </div>

      <form id="guestTrackForm">
        <div class="form-group">
          <label class="form-label">Order ID or Mobile Number</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="guestTrackInput" class="form-control" placeholder="e.g. OOTY-1001 or 9876543210" required>
            <button type="submit" class="btn-luxury-primary" style="padding: 10px 20px; font-size: 0.82rem; white-space: nowrap;">
              Track Order
            </button>
          </div>
        </div>
      </form>
      <div id="guestTrackResultBox" style="margin-top: 16px;"></div>
    `;

    document.getElementById('guestTrackForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = document.getElementById('guestTrackInput').value.trim();
      const resBox = document.getElementById('guestTrackResultBox');
      if (!resBox) return;

      resBox.innerHTML = `<p style="color: #78716c; text-align: center; padding: 10px;">Searching order...</p>`;
      try {
        const res = await fetch(`/api/orders/track?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success && data.orders.length > 0) {
          renderOrderCards(data.orders, resBox, query, true);
        } else {
          resBox.innerHTML = `
            <div style="text-align: center; padding: 20px; background: #fff1f2; border-radius: 8px; color: #b91c1c;">
              No orders found matching "<strong>${query}</strong>". Please verify your Order ID or phone number.
            </div>
          `;
        }
      } catch (err) {
        resBox.innerHTML = `<p style="color: red; text-align: center;">Error tracking order.</p>`;
      }
    });

    accountModal.classList.add('active');
  }
}

function renderOrderCards(orders, container, phone, isGuestSearch = false) {
  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 10px; color: #a8a29e;">
        <div style="font-size: 3rem; margin-bottom: 10px;">📦</div>
        <h4 style="font-family: var(--font-serif); font-size: 1.3rem; color: #1c1917; margin-bottom: 6px;">
          No Orders Placed Yet
        </h4>
        <p style="font-size: 0.9rem; color: #78716c; max-width: 380px; margin: 0 auto 18px;">
          No orders were found for <strong>+91 ${phone}</strong>. Explore our fresh Ooty Varkey, homemade chocolates, and estate teas!
        </p>
        <button type="button" class="btn-menagaii-cta" style="padding: 12px 24px;" onclick="closeAllModals(); window.location.href='/shop.html';">
          Browse Shop Catalog
        </button>
      </div>
    `;
    return;
  }

  const cardsHtml = orders.map(ord => {
    const dateFormatted = new Date(ord.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const status = ord.status || 'Pending';
    const statusClass = 'status-' + status.toLowerCase();

    // Determine tracker steps
    const steps = ['Placed', 'Confirmed', 'Dispatched', 'Delivered'];
    let activeStepIdx = 0;
    if (status === 'Confirmed' || status === 'Preparing') activeStepIdx = 1;
    else if (status === 'Dispatched') activeStepIdx = 2;
    else if (status === 'Delivered') activeStepIdx = 3;

    const trackerHtml = steps.map((s, idx) => {
      const isCompleted = idx < activeStepIdx;
      const isActive = idx === activeStepIdx;
      return `
        <div class="order-step-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
          <div class="order-step-dot">${isCompleted ? '✓' : idx + 1}</div>
          <span class="order-step-label">${s}</span>
        </div>
      `;
    }).join('');

    const itemsHtml = (ord.items || []).map(item => `
      <div class="order-item-line">
        <div class="order-item-title-box">
          <span class="order-item-title">${item.name}</span>
          <span class="order-item-sub">${item.unit || '1 pack'} • ₹${item.price} x ${item.quantity}</span>
        </div>
        <span class="order-item-cost">₹${item.total || (item.price * item.quantity)}</span>
      </div>
    `).join('');

    const waText = encodeURIComponent(`Hi Ooty Hills, please give me a delivery update for Order #${ord.id} (${ord.customer ? ord.customer.name : ''}). Thank you!`);
    const waUrl = `https://wa.me/${storeState.settings.whatsappNumber || '919514292383'}?text=${waText}`;

    // Prepare JSON items for reorder
    const itemsJson = encodeURIComponent(JSON.stringify(ord.items || []));

    return `
      <div class="order-card">
        <div class="order-card-header">
          <div class="order-id-date">
            <h4>#${ord.id}</h4>
            <span>Placed on ${dateFormatted}</span>
          </div>
          <span class="order-status-pill ${statusClass}">
            ● ${status}
          </span>
        </div>

        <div class="order-steps-tracker">
          ${trackerHtml}
        </div>

        <div class="order-items-wrapper">
          ${itemsHtml}
        </div>

        <div class="order-card-footer">
          <div class="order-address-snippet">
            <strong>📍 Delivery Address:</strong><br>
            ${ord.customer ? `
              ${ord.customer.name} (+91 ${ord.customer.phone})<br>
              ${ord.customer.address}, ${ord.customer.city || 'Ooty'} - ${ord.customer.pincode || ''}
              ${ord.customer.landmark ? `<br>Landmark: ${ord.customer.landmark}` : ''}
            ` : 'Standard Customer Address'}
            <div style="font-size: 0.76rem; color: #78716c; margin-top: 4px;">
              Payment: <strong>${ord.paymentMethod || 'Cash on Delivery'}</strong>
            </div>
          </div>

          <div class="order-total-block">
            <span style="font-size: 0.78rem; color: #78716c; display: block;">Total Amount:</span>
            <span class="grand-total">₹${ord.total}</span>

            <div class="order-actions-row">
              <a href="${waUrl}" target="_blank" class="btn-order-wa" title="Chat with bakery on WhatsApp">
                💬 WhatsApp
              </a>
              <button type="button" class="btn-order-reorder" onclick="reorderOrderItems('${itemsJson}')" title="Add all items to cart">
                🔄 Reorder
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    ${!isGuestSearch && storeState.customer ? `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding: 4px 2px;">
        <span style="font-size: 0.88rem; color: #57534e;">
          Showing <strong>${orders.length} order${orders.length > 1 ? 's' : ''}</strong> for <strong>${storeState.customer.name}</strong>
        </span>
        <button type="button" style="background: none; border: none; color: var(--brand-primary); font-size: 0.8rem; font-weight: 700; cursor: pointer; text-decoration: underline;" onclick="openOrdersModal()">
          ↻ Refresh Orders
        </button>
      </div>
    ` : ''}

    <div class="orders-list-container">
      ${cardsHtml}
    </div>
  `;
}

function reorderOrderItems(itemsJsonEncoded) {
  try {
    const items = JSON.parse(decodeURIComponent(itemsJsonEncoded));
    if (!items || items.length === 0) return;

    items.forEach(it => {
      const existing = storeState.cart.find(c => c.id === it.id);
      if (existing) {
        existing.quantity += (it.quantity || 1);
      } else {
        const prod = storeState.products.find(p => p.id === it.id);
        storeState.cart.push({
          id: it.id,
          name: it.name,
          price: it.price,
          unit: it.unit || '1 pack',
          image: prod ? prod.image : '/images/varkey.jpg',
          quantity: it.quantity || 1
        });
      }
    });

    saveCartToStorage();
    renderCart();
    closeAllModals();
    openCartDrawer();
    alert('Items from this order have been added to your shopping bag! 👜');
  } catch (e) {
    alert('Could not reorder items');
  }
}

// =========================================================
// MY ADDRESSES MODAL (MANAGE DELIVERY ADDRESSES)
// =========================================================
function openAddressModal() {
  closeAllModals();
  if (!customerAddressModal) return;

  const box = document.getElementById('addressContentBox');
  if (!box) return;

  if (storeState.customer) {
    renderAddressCard(box);
  } else {
    box.innerHTML = `
      <div style="text-align: center; padding: 35px 14px; color: #78716c;">
        <div style="font-size: 2.8rem; margin-bottom: 8px;">📍</div>
        <h4 style="font-family: var(--font-serif); font-size: 1.25rem; color: #1c1917; margin-bottom: 6px;">
          Saved Delivery Address
        </h4>
        <p style="font-size: 0.88rem; margin-bottom: 20px; line-height: 1.5; color: #57534e;">
          Please log in with your WhatsApp mobile number to save and manage your delivery addresses for express 1-click checkout.
        </p>
        <button type="button" class="btn-menagaii-cta" style="padding: 12px 24px; font-size: 0.92rem;" onclick="closeAllModals(); openCustomerAuthModal('login');">
          Login / Register with OTP 📲
        </button>
      </div>
    `;
  }

  customerAddressModal.classList.add('active');
}

function renderAddressCard(container) {
  const cust = storeState.customer;
  const hasAddress = cust.address && cust.address.trim().length > 0;

  container.innerHTML = `
    <div class="address-card-luxury">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <span class="address-badge-default">Default Delivery Address</span>
        <button type="button" class="btn-order-reorder" id="btnEditAddressMode" style="padding: 4px 10px; font-size: 0.78rem;">
          ✏️ Edit Address
        </button>
      </div>

      <div style="line-height: 1.6; color: #292524; font-size: 0.94rem;">
        <strong style="font-size: 1.05rem; color: #1c1917; display: block; margin-bottom: 2px;">
          ${cust.name}
        </strong>
        <div>📱 +91 ${cust.phone}</div>
        <div style="margin-top: 4px; color: #44403c;">
          ${hasAddress ? cust.address : '<span style="color: #a8a29e; font-style: italic;">No street address added yet</span>'}
        </div>
        <div style="color: #44403c;">
          ${cust.city || 'Ooty / Nilgiris'} - ${cust.pincode || '643001'}
        </div>
        ${cust.landmark ? `<div style="font-size: 0.84rem; color: #78716c;">Landmark: ${cust.landmark}</div>` : ''}
      </div>
    </div>

    <div style="display: flex; gap: 10px; margin-top: 20px;">
      <button type="button" class="btn-menagaii-cta" style="flex: 1; padding: 12px; font-size: 0.9rem;" onclick="closeAllModals(); openOrdersModal();">
        📦 View My Orders
      </button>
      <button type="button" class="btn-luxury-secondary" style="flex: 1; padding: 12px; font-size: 0.9rem;" onclick="closeAllModals(); openCartDrawer();">
        👜 Open Cart
      </button>
    </div>
  `;

  document.getElementById('btnEditAddressMode')?.addEventListener('click', () => {
    renderAddressEditForm(container);
  });
}

function renderAddressEditForm(container) {
  const cust = storeState.customer;

  container.innerHTML = `
    <div style="background: #faf8f5; border: 1px solid var(--border-light); border-radius: 12px; padding: 20px;">
      <h4 style="font-family: var(--font-serif); font-size: 1.15rem; color: #1c1917; margin-bottom: 14px;">
        Edit Delivery Address 📍
      </h4>

      <form id="addressUpdateForm">
        <div class="form-group">
          <label class="form-label" for="editCustName">Recipient Full Name *</label>
          <input type="text" id="editCustName" class="form-control" value="${cust.name || ''}" required>
        </div>

        <div class="form-group">
          <label class="form-label" for="editCustAddress">Flat, House No., Building, Street *</label>
          <textarea id="editCustAddress" class="form-control" rows="2" required placeholder="Complete delivery address">${cust.address || ''}</textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 10px;">
          <div class="form-group">
            <label class="form-label" for="editCustCity">City / District *</label>
            <input type="text" id="editCustCity" class="form-control" value="${cust.city || 'Ooty'}" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="editCustPincode">Pincode *</label>
            <input type="text" id="editCustPincode" class="form-control" value="${cust.pincode || '643001'}" pattern="[0-9]{6}" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="editCustLandmark">Landmark (Optional)</label>
          <input type="text" id="editCustLandmark" class="form-control" value="${cust.landmark || ''}" placeholder="Near Church, Post Office, Lake, etc.">
        </div>

        <div style="display: flex; gap: 10px; margin-top: 14px;">
          <button type="submit" class="btn-menagaii-cta" id="btnSaveAddressSubmit" style="flex: 1; padding: 12px; font-size: 0.92rem;">
            Save Delivery Address
          </button>
          <button type="button" class="btn-luxury-secondary" style="padding: 12px 18px; font-size: 0.92rem;" onclick="openAddressModal()">
            Cancel
          </button>
        </div>
      </form>
    </div>
  `;

  const form = document.getElementById('addressUpdateForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        phone: cust.phone,
        name: document.getElementById('editCustName').value.trim(),
        address: document.getElementById('editCustAddress').value.trim(),
        city: document.getElementById('editCustCity').value.trim(),
        pincode: document.getElementById('editCustPincode').value.trim(),
        landmark: document.getElementById('editCustLandmark').value.trim()
      };

      const btn = document.getElementById('btnSaveAddressSubmit');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
      }

      try {
        const res = await fetch('/api/customer/address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success && data.customer) {
          storeState.customer = data.customer;
          localStorage.setItem('ooty_customer', JSON.stringify(data.customer));
          updateCustomerAccountUI();
          alert('Delivery address updated successfully! 📍');
          renderAddressCard(container);
        } else {
          alert(data.message || 'Error updating address');
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save Delivery Address';
          }
        }
      } catch (err) {
        alert('Server communication error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Save Delivery Address';
        }
      }
    });
  }
}

// =========================================================
// IT ENTERPRISE CUSTOMER PORTAL PAGE (account.html)
// =========================================================

window.handlePortalHeaderAuth = () => {
  if (storeState.customer) {
    showLogoutConfirmationModal({
      name: storeState.customer.name,
      phone: storeState.customer.phone,
      onConfirm: () => {
        window.switchCustomerSession(null);
        showLogoutSuccessModal({
          onDone: () => {
            initAccountPortalPage();
          }
        });
      }
    });
  } else {
    initAccountPortalPage();
  }
};

async function initAccountPortalPage() {
  const container = document.getElementById('portalMainContainer');
  if (!container) return;

  const authBtnText = document.getElementById('portalAuthBtnText');
  if (storeState.customer) {
    const firstName = storeState.customer.name ? storeState.customer.name.split(' ')[0] : 'Customer';
    if (authBtnText) {
      authBtnText.innerHTML = `<span class="desktop-only-txt">Sign Out (${firstName})</span><span class="mobile-only-txt">Exit</span>`;
    }
    renderPortalDashboard(container);
  } else {
    if (authBtnText) {
      authBtnText.innerHTML = `<span class="desktop-only-txt">Login / Sign Up</span><span class="mobile-only-txt">Login</span>`;
    }
    renderPortalAuthGateway(container);
  }
}

async function renderPortalDashboard(container) {
  const cust = storeState.customer;
  const initials = (cust.name || 'Customer').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const regYear = cust.registeredAt ? new Date(cust.registeredAt).getFullYear() : '2026';

  container.innerHTML = `
    <!-- 1. Customer Hero Profile Card -->
    <div class="portal-profile-hero">
      <div class="portal-user-meta-group">
        <div class="portal-avatar-circle">${initials}</div>
        <div class="portal-user-details">
          <h1>
            ${cust.name}
            <span class="portal-verified-chip">✓ Verified Nilgiris Customer</span>
          </h1>
          <div class="portal-user-contact">
            <span>📱 +91 ${cust.phone}</span>
            <span>📍 ${cust.city || 'Ooty, Nilgiris'} - ${cust.pincode || '643001'}</span>
            <span>📅 Member since ${regYear}</span>
          </div>
        </div>
      </div>

      <div class="portal-metrics-row">
        <div class="portal-metric-card">
          <span class="portal-metric-val" id="portalMetricOrdersCount">-</span>
          <span class="portal-metric-lbl">Orders</span>
        </div>
        <div class="portal-metric-card">
          <span class="portal-metric-val" id="portalMetricWishlistCount">${storeState.wishlist.length}</span>
          <span class="portal-metric-lbl">Wishlist</span>
        </div>
        <div class="portal-metric-card">
          <span class="portal-metric-val" style="color: #059669;">Active</span>
          <span class="portal-metric-lbl">2FA OTP</span>
        </div>
      </div>
    </div>

    <!-- 2. Segmented Navigation Tabs -->
    <div class="portal-tabs-nav">
      <button type="button" class="portal-tab-btn active" data-portal-tab="orders">
        <span>📦 My Orders & Tracking</span>
        <span class="portal-tab-count" id="tabOrdersBadge">0</span>
      </button>
      <button type="button" class="portal-tab-btn" data-portal-tab="addresses">
        <span>📍 Delivery Addresses & Contact</span>
      </button>
      <button type="button" class="portal-tab-btn" data-portal-tab="wishlist">
        <span>🤍 Saved Wishlist</span>
        <span class="portal-tab-count">${storeState.wishlist.length}</span>
      </button>
      <button type="button" class="portal-tab-btn" data-portal-tab="security">
        <span>🛡️ Security & Sessions</span>
      </button>
    </div>

    <!-- 3. Tab Panels -->
    <!-- Tab Panel 1: Orders -->
    <div class="portal-tab-content active" id="portalTabPanelOrders">
      <div class="portal-orders-toolbar">
        <div class="portal-orders-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="portalOrderSearchInput" placeholder="Search orders by ID or snack name...">
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="portal-nav-btn secondary" style="font-size: 0.8rem;" onclick="loadPortalOrdersList()">
            🔄 Refresh Status
          </button>
          <a href="/shop.html" class="portal-nav-btn primary" style="font-size: 0.8rem;">
            + New Order
          </a>
        </div>
      </div>

      <div id="portalOrdersListContainer">
        <div style="text-align: center; padding: 40px; color: #64748b;">
          <div style="font-size: 2rem; margin-bottom: 8px;">⏳</div>
          <p>Retrieving your order dispatch history...</p>
        </div>
      </div>
    </div>

    <!-- Tab Panel 2: Addresses -->
    <div class="portal-tab-content" id="portalTabPanelAddresses">
      <div class="it-address-card">
        <div class="it-address-card-header">
          <div>
            <h3 style="font-size: 1.1rem; font-weight: 800; color: #0f172a; margin: 0 0 2px;">Primary Delivery Destination</h3>
            <span style="font-size: 0.8rem; color: #64748b;">Default address for 1-click WhatsApp order dispatch</span>
          </div>
          <span class="it-address-default-badge">DEFAULT</span>
        </div>

        <form id="portalAddressForm">
          <div class="it-input-group">
            <span class="it-input-icon">👤</span>
            <input type="text" class="it-input-control" id="pAddrName" value="${cust.name || ''}" placeholder="Recipient Full Name" required>
          </div>

          <div class="it-input-group">
            <span class="it-input-icon">📍</span>
            <textarea class="it-input-control" id="pAddrStreet" rows="2" placeholder="House / Flat No., Apartment, Street Address" required style="resize: vertical;">${cust.address || ''}</textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px;">
            <div class="it-input-group">
              <span class="it-input-icon">🏢</span>
              <input type="text" class="it-input-control" id="pAddrCity" value="${cust.city || 'Ooty'}" placeholder="City / Town" required>
            </div>
            <div class="it-input-group">
              <span class="it-input-icon">📮</span>
              <input type="text" class="it-input-control" id="pAddrPincode" value="${cust.pincode || '643001'}" placeholder="Pincode (6 digits)" pattern="[0-9]{6}" required>
            </div>
          </div>

          <div class="it-input-group">
            <span class="it-input-icon">🧭</span>
            <input type="text" class="it-input-control" id="pAddrLandmark" value="${cust.landmark || ''}" placeholder="Landmark (Near Lake, Botanical Garden, etc.)">
          </div>

          <button type="submit" class="it-btn-submit" id="btnSavePortalAddress">
            <span>💾</span> Update & Save Delivery Destination
          </button>
        </form>
      </div>
    </div>

    <!-- Tab Panel 3: Wishlist -->
    <div class="portal-tab-content" id="portalTabPanelWishlist">
      <div id="portalWishlistContainer"></div>
    </div>

    <!-- Tab Panel 4: Security -->
    <div class="portal-tab-content" id="portalTabPanelSecurity">
      <div class="it-address-card" style="max-width: 620px;">
        <h3 style="font-size: 1.15rem; font-weight: 800; color: #0f172a; margin-bottom: 6px;">
          Security & Active Session
        </h3>
        <p style="font-size: 0.86rem; color: #64748b; margin-bottom: 20px;">
          Your Ooty Hills account utilizes passwordless, 256-bit encrypted Real OTP authentication directly verified over WhatsApp and Indian Carrier SMS.
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 0.9rem;">
            <span style="color: #64748b;">Registered Mobile:</span>
            <strong>+91 ${cust.phone}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 0.9rem;">
            <span style="color: #64748b;">Authentication Mode:</span>
            <span style="color: #059669; font-weight: 700;">Passwordless Mobile OTP</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
            <span style="color: #64748b;">Last Authenticated:</span>
            <span>${cust.lastLoginAt ? new Date(cust.lastLoginAt).toLocaleString('en-IN') : 'Just now'}</span>
          </div>
        </div>

        <button type="button" class="portal-nav-btn secondary" style="color: #b91c1c; border-color: #fecaca; width: 100%; justify-content: center; padding: 12px;" onclick="handlePortalHeaderAuth()">
          Sign Out of This Device 🚪
        </button>
      </div>
    </div>
  `;

  // Bind Tab Switching
  const tabs = container.querySelectorAll('.portal-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      container.querySelectorAll('.portal-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetId = 'portalTabPanel' + btn.getAttribute('data-portal-tab').charAt(0).toUpperCase() + btn.getAttribute('data-portal-tab').slice(1);
      document.getElementById(targetId)?.classList.add('active');
    });
  });

  // Activate tab from URL query param (e.g. /account?tab=orders or /account?tab=addresses)
  const portalTabParam = (new URLSearchParams(window.location.search).get('tab') || '').toLowerCase();
  if (portalTabParam) {
    let cleanTab = portalTabParam;
    if (cleanTab === 'order') cleanTab = 'orders';
    if (cleanTab === 'address') cleanTab = 'addresses';
    const targetBtn = container.querySelector(`.portal-tab-btn[data-portal-tab="${cleanTab}"]`);
    if (targetBtn) {
      targetBtn.click();
    }
  }

  // Bind Address Form Save
  const addrForm = document.getElementById('portalAddressForm');
  if (addrForm) {
    addrForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btnSavePortalAddress');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span>⏳</span> Saving updates...`;
      }

      try {
        const payload = {
          phone: cust.phone,
          name: document.getElementById('pAddrName').value.trim(),
          address: document.getElementById('pAddrStreet').value.trim(),
          city: document.getElementById('pAddrCity').value.trim(),
          pincode: document.getElementById('pAddrPincode').value.trim(),
          landmark: document.getElementById('pAddrLandmark').value.trim()
        };

        const res = await fetch('/api/customer/address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success && data.customer) {
          storeState.customer = data.customer;
          localStorage.setItem('ooty_customer', JSON.stringify(data.customer));
          updateCustomerAccountUI();
          alert('Delivery address updated successfully! 📍');
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<span>💾</span> Update & Save Delivery Destination`;
          }
        } else {
          alert(data.message || 'Error updating address');
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<span>💾</span> Update & Save Delivery Destination`;
          }
        }
      } catch (err) {
        alert('Server communication error');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = `<span>💾</span> Update & Save Delivery Destination`;
        }
      }
    });
  }

  // Load Initial Orders & Wishlist
  loadPortalOrdersList();
  renderPortalWishlist();
}

async function loadPortalOrdersList() {
  const container = document.getElementById('portalOrdersListContainer');
  if (!container || !storeState.customer) return;

  try {
    const res = await fetch(`/api/customer/orders?phone=${encodeURIComponent(storeState.customer.phone)}`);
    const data = await res.json();
    const orders = (data.success && data.orders) ? data.orders : [];

    // Update counts
    const countBadge = document.getElementById('tabOrdersBadge');
    if (countBadge) countBadge.textContent = orders.length;
    const metricCount = document.getElementById('portalMetricOrdersCount');
    if (metricCount) metricCount.textContent = orders.length;

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="it-empty-state">
          <div class="it-empty-icon">📦</div>
          <h3>No Orders Recorded Yet</h3>
          <p>
            You haven't placed an order with +91 ${storeState.customer.phone} yet. Browse our woodfired Ooty varkey, homemade chocolates, and fresh estate teas.
          </p>
          <a href="/shop.html" class="portal-nav-btn primary" style="display: inline-flex;">
            Explore Shop Catalog 🛍️
          </a>
        </div>
      `;
      return;
    }

    renderPortalOrderCards(orders, container);

    // Setup live search filter
    const searchInput = document.getElementById('portalOrderSearchInput');
    if (searchInput) {
      searchInput.oninput = (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) {
          renderPortalOrderCards(orders, container);
          return;
        }
        const filtered = orders.filter(o => 
          o.id.toLowerCase().includes(q) || 
          (o.items && o.items.some(i => i.name.toLowerCase().includes(q)))
        );
        renderPortalOrderCards(filtered, container);
      };
    }
  } catch (err) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: #b91c1c;">
        Error connecting to orders service. Please check connection.
      </div>
    `;
  }
}

function renderPortalOrderCards(orders, container) {
  if (orders.length === 0) {
    container.innerHTML = `
      <div class="it-empty-state">
        <h3>No Matching Orders Found</h3>
        <p>Try searching with another keyword or Order ID.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map(ord => {
    const dateFormatted = new Date(ord.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const status = ord.status || 'Pending';
    const statusClass = status.toLowerCase();

    // Visual Stepper Steps: Placed -> Confirmed -> Dispatched -> Delivered
    const steps = [
      { key: 'placed', label: 'Order Placed' },
      { key: 'confirmed', label: 'Fresh Batch Confirmed' },
      { key: 'dispatched', label: 'Dispatched / In Transit' },
      { key: 'delivered', label: 'Delivered to Doorstep' }
    ];

    let activeStepIdx = 0;
    if (status === 'Confirmed' || status === 'Preparing') activeStepIdx = 1;
    else if (status === 'Dispatched') activeStepIdx = 2;
    else if (status === 'Delivered') activeStepIdx = 3;

    const progressPercent = (activeStepIdx / (steps.length - 1)) * 100;

    const stepperNodesHtml = steps.map((s, idx) => {
      const isCompleted = idx < activeStepIdx;
      const isActive = idx === activeStepIdx;
      return `
        <div class="it-stepper-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
          <div class="it-stepper-node">${isCompleted ? '✓' : idx + 1}</div>
          <span class="it-stepper-label">${s.label}</span>
        </div>
      `;
    }).join('');

    const itemsHtml = (ord.items || []).map(item => `
      <div class="it-order-item-row">
        <img src="${item.image || '/images/varkey.jpg'}" alt="${item.name}" class="it-item-thumb" onerror="this.src='/images/varkey.jpg'">
        <div class="it-item-info">
          <h4 class="it-item-name">${item.name}</h4>
          <span class="it-item-meta">${item.unit || '1 pack'} • ₹${item.price} × ${item.quantity}</span>
        </div>
        <span class="it-item-price">₹${item.total || (item.price * item.quantity)}</span>
      </div>
    `).join('');

    const waText = encodeURIComponent(`Hi Ooty Hills Bakery, please provide a status update on Order #${ord.id}. Recipient: ${ord.customer ? ord.customer.name : ''}. Thank you!`);
    const waUrl = `https://wa.me/${storeState.settings.whatsappNumber || '919514292383'}?text=${waText}`;
    const itemsJson = encodeURIComponent(JSON.stringify(ord.items || []));

    return `
      <div class="it-order-card">
        <div class="it-order-card-header">
          <div class="it-order-id-chip">
            <span class="it-order-id-text">#${ord.id}</span>
            <span class="it-order-date">Placed on ${dateFormatted}</span>
          </div>
          <span class="it-order-status-badge ${statusClass}">
            <span class="dot"></span> ${status}
          </span>
        </div>

        <div class="it-stepper-container">
          <div class="it-stepper-track">
            <div class="it-stepper-progress-bg"></div>
            <div class="it-stepper-progress-fill" style="width: ${progressPercent}%;"></div>
            ${stepperNodesHtml}
          </div>
        </div>

        <div class="it-order-items-box">
          ${itemsHtml}
        </div>

        <div class="it-order-footer">
          <div class="it-order-shipping-summary">
            <strong>📍 Destination:</strong> 
            ${ord.customer ? `${ord.customer.name}, ${ord.customer.address}, ${ord.customer.city || 'Ooty'} - ${ord.customer.pincode || ''}` : 'Customer Address'}
            <br>
            <span style="color: #64748b; font-size: 0.76rem;">Payment: ${ord.paymentMethod || 'Cash on Delivery'}</span>
          </div>

          <div class="it-order-total-box">
            <span style="font-size: 0.74rem; color: #64748b; text-transform: uppercase;">Total Invoice</span>
            <div class="it-order-grand-total">₹${ord.total}</div>
          </div>

          <div class="it-order-actions-bar">
            <a href="${waUrl}" target="_blank" class="it-btn-wa-live" title="Direct live WhatsApp logistics support">
              <span>💬</span> Track Live on WhatsApp
            </a>
            <button type="button" class="it-btn-reorder" onclick="reorderOrderItems('${itemsJson}')" title="Add all items back to shopping cart">
              <span>🔄</span> 1-Click Reorder
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderPortalWishlist() {
  const container = document.getElementById('portalWishlistContainer');
  if (!container) return;

  const items = storeState.products.filter(p => storeState.wishlist.includes(p.id));

  if (items.length === 0) {
    const isLoggedIn = Boolean(storeState.customer);
    container.innerHTML = `
      <div class="wishlist-empty-stage" style="padding: 40px 20px;">
        <div class="wishlist-heart-icon-box">
          <svg viewBox="0 0 24 24" class="wishlist-heart-outline">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </div>
        <h2 class="wishlist-title">Your wishlist is empty</h2>
        <p class="wishlist-subtitle">
          ${isLoggedIn ? 'Save your favourite snacks and teas here and come back to them anytime.' : 'Please login to save your favourite snacks & treats.'}
        </p>
        <div class="wishlist-actions">
          ${!isLoggedIn ? `<button type="button" class="btn-wishlist-login-cta" onclick="handlePortalHeaderAuth()">LOGIN</button>` : ''}
          <a href="/shop.html" class="btn-wishlist-explore-cta">EXPLORE COLLECTION</a>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="it-wishlist-grid">
      ${items.map(p => `
        <div class="it-wishlist-card">
          <img src="${p.image}" alt="${p.name}" class="it-wishlist-img" onerror="this.src='/images/varkey.jpg'">
          <div class="it-wishlist-body">
            <div>
              <h4 style="font-size: 1rem; font-weight: 700; color: #0f172a; margin-bottom: 4px;">${p.name}</h4>
              <span style="font-size: 0.82rem; color: #64748b;">${p.unit || '1 pack'}</span>
              <div style="font-size: 1.15rem; font-weight: 800; color: var(--portal-primary); margin: 6px 0 12px;">₹${p.price}</div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="portal-nav-btn primary" style="flex: 1; justify-content: center; font-size: 0.82rem;" onclick="addToCart('${p.id}')">
                Add to Bag 👜
              </button>
              <button type="button" class="portal-nav-btn secondary" style="padding: 8px 12px; color: #ef4444;" onclick="toggleWishlist('${p.id}', event); renderPortalWishlist();" title="Remove">
                ✕
              </button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ---------------------------------------------------------
// IT ENTERPRISE GUEST AUTH GATEWAY (FOR ACCOUNT PORTAL)
// ---------------------------------------------------------
function renderPortalAuthGateway(container, activeTab = 'login', prefillPhone = '') {
  container.innerHTML = `
    <div class="it-auth-container">
      <div class="it-auth-top-bar"></div>
      <div class="it-auth-card-body">
        <span class="it-auth-brand-badge">🛡️ Ooty Hills ID • Secure Access Gateway</span>
        <h2>${activeTab === 'register' ? 'Create Customer Account' : 'Sign In to Customer Portal'}</h2>
        <p>
          ${activeTab === 'register' 
            ? 'Register your account once with delivery details. When logging in, receive an instant OTP directly on your phone.' 
            : 'Enter your registered 10-digit mobile number to receive your real-time verification OTP.'}
        </p>

        <!-- Segmented Tab Switcher -->
        <div class="auth-tabs-wrapper">
          <button type="button" class="auth-tab-btn ${activeTab === 'register' ? 'active' : ''}" id="portalTabReg">
            ✨ New Customer (Sign Up)
          </button>
          <button type="button" class="auth-tab-btn ${activeTab === 'login' ? 'active' : ''}" id="portalTabLog">
            🔑 Returning Customer (Login)
          </button>
        </div>

        ${activeTab === 'register' ? `
          <form id="portalRegisterForm">
            <div class="it-input-group">
              <span class="it-input-icon">👤</span>
              <input type="text" class="it-input-control" id="portalRegName" placeholder="Full Name (Letters only)" maxlength="50" pattern="[a-zA-Z\s.'-]{2,50}" title="Letters only, at least 2 characters" required autofocus>
            </div>

            <div class="it-input-group">
              <span class="it-input-icon" style="font-weight: 700; color: #475569; font-size: 0.82rem;">🇮🇳 +91</span>
              <input type="tel" class="it-input-control" id="portalRegPhone" style="padding-left: 64px;" placeholder="9876543210 (10 digits)" maxlength="10" pattern="[6-9][0-9]{9}" inputmode="numeric" value="${prefillPhone || ''}" required>
            </div>

            <div class="it-input-group">
              <span class="it-input-icon">📍</span>
              <textarea class="it-input-control" id="portalRegAddress" rows="2" placeholder="Delivery Address (Flat / House / Street)" required style="resize: vertical;"></textarea>
            </div>

            <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 10px;">
              <div class="it-input-group">
                <span class="it-input-icon">🏢</span>
                <input type="text" class="it-input-control" id="portalRegCity" placeholder="City / Town" maxlength="40" pattern="[a-zA-Z\s.'-]{2,40}" required>
              </div>
              <div class="it-input-group">
                <span class="it-input-icon">📮</span>
                <input type="tel" class="it-input-control" id="portalRegPincode" placeholder="Pincode (6 digits)" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" required>
              </div>
            </div>

            <div class="it-input-group">
              <span class="it-input-icon">🧭</span>
              <input type="text" class="it-input-control" id="portalRegLandmark" placeholder="Landmark (Optional)">
            </div>

            <button type="submit" class="it-btn-submit" id="btnPortalRegSubmit">
              Create Account & Proceed to Login ➡️
            </button>
          </form>
        ` : `
          <form id="portalLoginForm">
            <div class="it-input-group">
              <span class="it-input-icon" style="font-weight: 700; color: #475569; font-size: 0.82rem;">🇮🇳 +91</span>
              <input type="tel" class="it-input-control" id="portalLoginPhone" style="padding-left: 64px;" placeholder="9876543210 (10 digits)" maxlength="10" pattern="[6-9][0-9]{9}" inputmode="numeric" value="${prefillPhone || ''}" required autofocus>
            </div>

            <button type="submit" class="it-btn-submit" id="btnPortalLoginSubmit">
              Send Login OTP to Mobile 📲
            </button>
          </form>
        `}

        <div style="margin-top: 24px; text-align: center; font-size: 0.78rem; color: #94a3b8; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <span>🔒 256-Bit SSL • Fast2SMS & WhatsApp Gateway Secured</span>
        </div>
      </div>
    </div>
  `;

  // Attach real-time input filters for portal
  const pName = document.getElementById('portalRegName');
  if (pName) pName.addEventListener('input', e => { e.target.value = e.target.value.replace(/[^a-zA-Z\s.'-]/g, ''); });
  const pPhone = document.getElementById('portalRegPhone');
  if (pPhone) pPhone.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
  const pLogPhone = document.getElementById('portalLoginPhone');
  if (pLogPhone) pLogPhone.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
  const pCity = document.getElementById('portalRegCity');
  if (pCity) pCity.addEventListener('input', e => { e.target.value = e.target.value.replace(/[^a-zA-Z\s.'-]/g, ''); });
  const pPin = document.getElementById('portalRegPincode');
  if (pPin) pPin.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });

  // Bind Switchers
  document.getElementById('portalTabReg')?.addEventListener('click', () => renderPortalAuthGateway(container, 'register', prefillPhone));
  document.getElementById('portalTabLog')?.addEventListener('click', () => renderPortalAuthGateway(container, 'login', prefillPhone));

  // Handle Registration
  const regForm = document.getElementById('portalRegisterForm');
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (document.getElementById('portalRegName')?.value || '').trim();
      const phone = (document.getElementById('portalRegPhone')?.value || '').replace(/\D/g, '').slice(0, 10);
      const address = (document.getElementById('portalRegAddress')?.value || '').trim();
      const city = (document.getElementById('portalRegCity')?.value || '').trim();
      const pincode = (document.getElementById('portalRegPincode')?.value || '').trim();
      const landmark = (document.getElementById('portalRegLandmark')?.value || '').trim();

      if (!name || name.length < 2 || !/^[a-zA-Z\s.'-]+$/.test(name)) {
        alert('Please enter a valid full name using letters only (minimum 2 characters).');
        document.getElementById('portalRegName')?.focus();
        return;
      }

      if (!phone || phone.length !== 10 || !/^[6-9]\d{9}$/.test(phone)) {
        alert('Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.');
        document.getElementById('portalRegPhone')?.focus();
        return;
      }

      if (!address || address.length < 5) {
        alert('Please enter your complete delivery address (minimum 5 characters).');
        document.getElementById('portalRegAddress')?.focus();
        return;
      }

      if (!city || city.length < 2 || !/^[a-zA-Z\s.'-]+$/.test(city)) {
        alert('Please enter your delivery city or town (letters only).');
        document.getElementById('portalRegCity')?.focus();
        return;
      }

      if (!pincode || !/^\d{6}$/.test(pincode)) {
        alert('Please enter a valid 6-digit postal pincode.');
        document.getElementById('portalRegPincode')?.focus();
        return;
      }

      const btn = document.getElementById('btnPortalRegSubmit');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Registering Account...';
      }

      try {
        const res = await fetch('/api/customer/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, address, city, pincode, landmark })
        });
        const data = await res.json();
        if (data.success) {
          showRegisterSuccessModal({
            customer: data.customer || { name, phone, address, city, pincode },
            onProceed: () => {
              renderPortalAuthGateway(container, 'login', phone);
            }
          });
        } else if (data.alreadyRegistered) {
          showRegisterSuccessModal({
            customer: { name, phone, address, city, pincode },
            onProceed: () => {
              renderPortalAuthGateway(container, 'login', phone);
            }
          });
        } else {
          alert(data.message || 'Registration failed');
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Create Account & Proceed to Login ➡️';
          }
        }
      } catch (err) {
        alert('Server connection error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Create Account & Proceed to Login ➡️';
        }
      }
    });
  }

  // Handle Login OTP Request
  const logForm = document.getElementById('portalLoginForm');
  if (logForm) {
    logForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('portalLoginPhone').value.replace(/\D/g, '').slice(-10);

      const btn = document.getElementById('btnPortalLoginSubmit');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending OTP...';
      }

      try {
        const res = await fetch('/api/customer/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await res.json();

        if (data.notRegistered) {
          alert(data.message || `+91 ${phone} is not registered yet. Please sign up first!`);
          renderPortalAuthGateway(container, 'register', phone);
          return;
        }

        if (data.success) {
          showOtpToast(phone, data.otp, 'login', data.whatsappOtpUrl, data.customerName);
          renderPortalOtpStep2(container, phone, data.otp, data.whatsappOtpUrl, data.customerName);
        } else {
          alert(data.message || 'Error sending OTP');
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Send Login OTP to Mobile 📲';
          }
        }
      } catch (err) {
        alert('Server connection error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Send Login OTP to Mobile 📲';
        }
      }
    });
  }
}

function renderPortalOtpStep2(container, phone, otp, whatsappOtpUrl, customerName) {
  container.innerHTML = `
    <div class="it-auth-container">
      <div class="it-auth-top-bar"></div>
      <div class="it-auth-card-body">
        <span class="it-auth-brand-badge">🔐 Two-Factor OTP Verification</span>
        <h2>Enter Verification Code</h2>
        <p>
          We have sent a 4-digit OTP to <strong>+91 ${phone}</strong> for <strong>${customerName || 'Customer'}</strong>.
        </p>

        ${whatsappOtpUrl ? `
          <div style="margin-bottom: 16px;">
            <a href="${whatsappOtpUrl}" target="_blank" class="it-btn-wa-live" style="width: 100%; justify-content: center; padding: 12px 16px; font-size: 0.94rem; box-shadow: 0 4px 14px rgba(37, 211, 102, 0.3);">
              <span style="font-size: 1.15rem;">💬</span> Open WhatsApp to Receive OTP Message
            </a>
          </div>
        ` : ''}

        <!-- Quick Demo Testing Code Helper (Always visible in both local and live) -->
        <div style="background: #fefce8; border: 1.5px dashed #eab308; border-radius: 12px; padding: 12px; margin-bottom: 18px; text-align: center; cursor: pointer;" onclick="quickFillPortalOtp('${otp}')" title="Click to Auto-Fill">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 0.74rem; font-weight: 700; color: #854d0e; text-transform: uppercase; letter-spacing: 0.5px;">
              🔑 Verification OTP Code:
            </span>
            <span style="background: #eab308; color: #713f12; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 6px;">
              ⚡ Auto-Fill
            </span>
          </div>
          <div style="font-family: monospace; font-size: 1.6rem; font-weight: 800; color: #1c1917; letter-spacing: 5px;">
            ${otp}
          </div>
          <div style="font-size: 0.72rem; color: #a16207; margin-top: 3px;">
            (Click anywhere on this card to fill code)
          </div>
        </div>

        <form id="portalOtpVerifyForm">
          <div class="otp-boxes-wrapper">
            <input type="tel" class="otp-digit-input" id="portalOtp0" maxlength="1" pattern="[0-9]" inputmode="numeric" autofocus required>
            <input type="tel" class="otp-digit-input" id="portalOtp1" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
            <input type="tel" class="otp-digit-input" id="portalOtp2" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
            <input type="tel" class="otp-digit-input" id="portalOtp3" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
            <input type="tel" class="otp-digit-input" id="portalOtp4" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
            <input type="tel" class="otp-digit-input" id="portalOtp5" maxlength="1" pattern="[0-9]" inputmode="numeric" required>
          </div>

          <button type="submit" class="it-btn-submit" id="btnVerifyPortalOtp">
            Verify & Access Customer Portal 🔓
          </button>

          <div style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
            <a href="javascript:void(0)" onclick="initAccountPortalPage()" style="font-size: 0.82rem; color: #64748b; font-weight: 600;">
              ← Change Number
            </a>
            <span style="font-size: 0.82rem; color: #64748b;">
              Valid for 5 mins
            </span>
          </div>
        </form>
      </div>
    </div>
  `;

  // Auto-advance
  const inputs = [
    document.getElementById('portalOtp0'),
    document.getElementById('portalOtp1'),
    document.getElementById('portalOtp2'),
    document.getElementById('portalOtp3'),
    document.getElementById('portalOtp4'),
    document.getElementById('portalOtp5')
  ];

  inputs.forEach((inp, idx) => {
    if (!inp) return;
    inp.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val ? val[0] : '';
      if (val && idx < 5) {
        inputs[idx + 1].focus();
        inputs[idx + 1].select();
      }
    });

    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && idx > 0) {
        inputs[idx - 1].focus();
      }
    });

    inp.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      for (let i = 0; i < pasteData.length; i++) {
        if (inputs[i]) inputs[i].value = pasteData[i];
      }
      if (pasteData.length === 6) {
        inputs[5].focus();
        document.getElementById('portalOtpVerifyForm')?.dispatchEvent(new Event('submit'));
      }
    });
  });

  inputs[0]?.focus();

  // Form Submit
  const vForm = document.getElementById('portalOtpVerifyForm');
  if (vForm) {
    vForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = inputs.map(i => i.value).join('');
      if (code.length !== 6) {
        alert('Please enter all 6 digits of the verification code');
        return;
      }

      const btn = document.getElementById('btnVerifyPortalOtp');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Verifying Authenticity...';
      }

      try {
        const res = await fetch('/api/customer/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone,
            otp: code,
            otpToken: window._lastOtpToken || '',
            customer: window._lastOtpCustomer || null
          })
        });
        const data = await res.json();
        if (data.success && data.customer) {
          window.switchCustomerSession(data.customer);
          document.getElementById('otpSmsBanner')?.classList.remove('show');
          showLoginSuccessModal({
            customer: data.customer,
            onProceed: () => {
              initAccountPortalPage();
            }
          });
        } else {
          alert(data.message || 'Invalid OTP code. Please try again.');
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Verify & Access Customer Portal 🔓';
          }
        }
      } catch (err) {
        alert('Verification server error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Verify & Access Customer Portal 🔓';
        }
      }
    });
  }
}

function quickFillPortalOtp(otp) {
  const str = otp.toString().trim();
  for (let i = 0; i < 4; i++) {
    const el = document.getElementById('portalOtp' + i);
    if (el) el.value = str[i] || '';
  }
  document.getElementById('btnVerifyPortalOtp')?.focus();
}

// =========================================================
// HEADER NAVIGATION DROPDOWN CONTROLLER (USER REFERENCE)
// =========================================================
function initHeaderNavDropdown() {
  const toggleBtn = document.getElementById('btnHeaderMenuToggle');
  const dropdownCard = document.getElementById('headerNavDropdownCard');
  const collectionsToggle = document.getElementById('btnDropdownCollectionsToggle');
  const collectionsList = document.getElementById('menuDropdownCollectionsList');
  const searchForm = document.querySelector('.dropdown-search-form');
  const searchInput = document.querySelector('.menu-dropdown-search-input');
  const accountLink = document.getElementById('menuDropdownAccountLink');

  if (!toggleBtn || !dropdownCard) return;

  // Toggle Dropdown on Hamburger Click
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdownCard.classList.contains('active');

    // Close any other open dropdowns (like account card)
    document.getElementById('accountDropdownCard')?.classList.remove('active');

    if (isOpen) {
      dropdownCard.classList.remove('active');
      toggleBtn.classList.remove('active');
      toggleBtn.setAttribute('aria-expanded', 'false');
    } else {
      dropdownCard.classList.add('active');
      toggleBtn.classList.add('active');
      toggleBtn.setAttribute('aria-expanded', 'true');
      setTimeout(() => {
        searchInput?.focus();
      }, 150);
    }
  });

  // Toggle Collections Accordion inside Dropdown
  if (collectionsToggle && collectionsList) {
    collectionsToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      collectionsToggle.classList.toggle('expanded');
      collectionsList.classList.toggle('open');
      dropdownCard.classList.toggle('collections-expanded', collectionsList.classList.contains('open'));
    });
  }

  // Handle Search Submission from Dropdown
  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (query) {
        window.location.href = `/shop.html?search=${encodeURIComponent(query)}`;
      }
    });
  }

  // Update active page link based on current URL
  const currentPath = window.location.pathname;
  const menuLinks = dropdownCard.querySelectorAll('.menu-dropdown-link');
  menuLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href === currentPath || (href !== '/' && currentPath.startsWith(href)))) {
      link.classList.add('active');
    }
  });

  // Update Account footer status in dropdown
  if (accountLink) {
    const custData = localStorage.getItem('ooty_customer');
    if (custData) {
      try {
        const c = JSON.parse(custData);
        if (c && c.name) {
          accountLink.innerHTML = `<span>👤</span> ${c.name.split(' ')[0]}`;
        }
      } catch (e) {}
    }
  }

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdownCard.contains(e.target) && !toggleBtn.contains(e.target)) {
      dropdownCard.classList.remove('active');
      toggleBtn.classList.remove('active');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropdownCard.classList.contains('active')) {
      dropdownCard.classList.remove('active');
      toggleBtn.classList.remove('active');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

// Global handler for inline onsubmit
window.handleDropdownSearchSubmit = (e) => {
  e.preventDefault();
  const input = e.target.querySelector('input');
  const query = input ? input.value.trim() : '';
  if (query) {
    window.location.href = `/shop.html?search=${encodeURIComponent(query)}`;
  }
};

// =========================================================
// COLLECTIONS FLYOUT SUBMENU CONTROLLER (SCREENSHOT 1, 2, 3)
// =========================================================
function initCollectionsFlyout() {
  const stages = document.querySelectorAll('.collections-dropdown-wrapper, .collections-dual-card-stage');

  stages.forEach(stage => {
    const primaryLinks = stage.querySelectorAll('.collections-primary-link');
    const secondaryCards = stage.querySelectorAll('.collections-secondary-card');

    if (primaryLinks.length === 0 || secondaryCards.length === 0) return;

    primaryLinks.forEach(link => {
      const targetCat = link.getAttribute('data-cat');

      const activateCategory = (e) => {
        primaryLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        secondaryCards.forEach(card => {
          if (card.getAttribute('data-cat') === targetCat) {
            card.classList.add('active');
          } else {
            card.classList.remove('active');
          }
        });
      };

      // Desktop hover: smoothly switches Card 2 to hovered category
      link.addEventListener('mouseenter', activateCategory);

      // Click / Touch:
      // When clicking primary category link on mobile/touch, activate it and prevent instant jump so types show
      link.addEventListener('click', (e) => {
        const isAlreadyActive = link.classList.contains('active');
        activateCategory(e);
        if (link.tagName === 'BUTTON' || !isAlreadyActive || window.innerWidth <= 1024) {
          e.preventDefault();
        }
      });

      link.addEventListener('touchstart', (e) => {
        const isAlreadyActive = link.classList.contains('active');
        if (!isAlreadyActive) {
          e.preventDefault();
          activateCategory(e);
        }
      }, { passive: false });
    });
  });

  // Submenu Type links (Square, Round, Oval, etc.)
  document.querySelectorAll('.submenu-type-link').forEach(typeLink => {
    if (typeLink.dataset.bound) return;
    typeLink.dataset.bound = 'true';
    typeLink.addEventListener('click', (e) => {
      const href = typeLink.getAttribute('href') || '';
      const url = new URL(href, window.location.origin);
      const type = url.searchParams.get('type');

      // Close mobile navigation dropdown if open
      document.getElementById('headerNavDropdownCard')?.classList.remove('active');
      document.getElementById('btnHeaderMenuToggle')?.classList.remove('active');
      document.getElementById('mobileCollectionsModal')?.classList.remove('is-open');

      if (window.location.pathname.includes('/shop') || window.location.pathname.endsWith('/shop.html')) {
        e.preventDefault();
        if (type) {
          storeState.selectedTypes.clear();
          storeState.selectedTypes.add(type);
          storeState.activeCategory = 'all';
          storeState.filterSearch = '';
          updateShopUrlParams();
          // Update checkboxes
          document.querySelectorAll('.cat-custom-checkbox').forEach(cb => {
            cb.checked = (cb.value === type);
          });
          renderProductsOnPages();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    });
  });

  // Submenu View All pill (All Vareky [VIEW ALL], etc.)
  document.querySelectorAll('.submenu-view-all-pill').forEach(viewAllLink => {
    if (viewAllLink.dataset.bound) return;
    viewAllLink.dataset.bound = 'true';
    viewAllLink.addEventListener('click', (e) => {
      // Close mobile navigation dropdown if open
      document.getElementById('headerNavDropdownCard')?.classList.remove('active');
      document.getElementById('btnHeaderMenuToggle')?.classList.remove('active');
      document.getElementById('mobileCollectionsModal')?.classList.remove('is-open');

      const href = viewAllLink.getAttribute('href') || '';
      const url = new URL(href, window.location.origin);
      const cat = url.searchParams.get('cat');

      if (window.location.pathname.includes('/shop') || window.location.pathname.endsWith('/shop.html')) {
        e.preventDefault();
        if (cat) {
          storeState.selectedTypes.clear();
          storeState.activeCategory = cat;
          storeState.filterSearch = '';
          updateShopUrlParams();
          // Sync checkboxes
          document.querySelectorAll('.cat-custom-checkbox').forEach(cb => {
            cb.checked = (cb.getAttribute('data-cat') === cat);
          });
          renderProductsOnPages();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    });
  });
}

// =========================================================
// FLOATING WHATSAPP BUTTON (MENAGAII REPLICA • OWNER: 9514292383)
// =========================================================
function ensureFloatingWhatsAppWidget() {
  const curPath = (window.location.pathname || '').toLowerCase();
  // DO NOT show floating WhatsApp button on login, register, or admin pages (per user request)
  if (curPath.includes('/admin') || curPath.includes('/login') || curPath.includes('/register') || curPath.endsWith('login.html') || curPath.endsWith('register.html')) {
    document.getElementById('floatingWhatsAppWidget')?.remove();
    return;
  }

  if (document.getElementById('floatingWhatsAppWidget')) return;

  const targetOwnerPhone = '919514292383';
  const defaultMsg = encodeURIComponent('Hello Hill Mades! I have an inquiry about your authentic Nilgiris delicacies.');
  const waUrl = `https://wa.me/${targetOwnerPhone}?text=${defaultMsg}`;

  const widget = document.createElement('a');
  widget.id = 'floatingWhatsAppWidget';
  widget.href = waUrl;
  widget.target = '_blank';
  widget.rel = 'noopener noreferrer';
  widget.className = 'floating-whatsapp-widget';
  widget.setAttribute('aria-label', 'Chat with Hill Mades on WhatsApp (+91 95142 92383)');
  widget.innerHTML = `
    <div class="wa-icon-circle">
      <svg viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
      <span class="wa-online-pulse"></span>
    </div>
    <div class="wa-label-box">
      <span class="wa-label-title">Chat with Us</span>
      <span class="wa-label-sub">+91 95142 92383</span>
    </div>
  `;
  document.body.appendChild(widget);
}

// =========================================================
// UNIVERSAL WHATSAPP CLICK INTERCEPTOR (OWNER: 9514292383)
// =========================================================
function setupUniversalWhatsAppInterceptor() {
  const targetOwnerPhone = '919514292383';
  document.addEventListener('click', (e) => {
    const waLink = e.target.closest('a[href*="wa.me"], a[href*="whatsapp.com"], .btn-checkout-whatsapp, .btn-whatsapp-chat');
    if (!waLink) return;

    // Checkout modal submit button handles order creation and sends its own full itemized bill
    if (waLink.tagName === 'BUTTON' && waLink.type === 'submit') return;
    if (waLink.id === 'proceedToCheckoutBtn') return;

    const currentHref = waLink.getAttribute('href');
    if (currentHref && currentHref.includes('wa.me')) {
      try {
        const url = new URL(currentHref);
        const pathDigits = url.pathname.replace(/\D/g, '');
        if (!pathDigits.endsWith('9514292383')) {
          const oldText = url.searchParams.get('text') || 'Hello Hill Mades! I have an inquiry about your delicacies.';
          waLink.href = `https://wa.me/${targetOwnerPhone}?text=${encodeURIComponent(oldText)}`;
        }
      } catch (err) {
        waLink.href = `https://wa.me/${targetOwnerPhone}?text=${encodeURIComponent('Hello Hill Mades! I have an inquiry about your delicacies.')}`;
      }
    }
  });
}

// =========================================================
// MOBILE COLLECTIONS UI & MODAL (SCREENSHOT 1 REPLICA)
// =========================================================
function ensureMobileCollectionsUI() {
  const curPath = (window.location.pathname || '').toLowerCase();
  // DO NOT inject collections modal on login, register, or admin pages
  if (curPath.includes('/admin') || curPath.includes('/login') || curPath.includes('/register') || curPath.endsWith('login.html') || curPath.endsWith('register.html')) {
    document.getElementById('mobileCollectionsModal')?.remove();
    document.getElementById('mobileSubnavStrip')?.remove();
    return;
  }

  // Clean up any subnav strip (Removed per user request)
  const existingStrip = document.getElementById('mobileSubnavStrip');
  if (existingStrip) existingStrip.remove();

  // Dedicated Mobile Collections Dual-Card Modal
  let modal = document.getElementById('mobileCollectionsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mobileCollectionsModal';
    modal.className = 'mobile-collections-modal-overlay';
    modal.innerHTML = `
      <div class="mobile-collections-modal-card">
        <div class="mobile-collections-modal-header">
          <div class="mobile-collections-modal-title">
            <span>🏷️</span> Curated Collections
          </div>
          <button type="button" class="mobile-collections-modal-close" id="btnCloseMobileCollectionsModal" aria-label="Close">✕</button>
        </div>
        <div class="collections-dual-card-stage" id="modalCollectionsDualStage" style="display: grid !important; grid-template-columns: 44% 56% !important; gap: 8px !important; padding: 10px 6px !important; background: #ffffff !important; border-radius: 14px !important; border: 1px solid #ebd9c8 !important; width: 100% !important; box-sizing: border-box !important;">
          <!-- Populated dynamically -->
        </div>
        <div style="padding-top: 14px; text-align: center;">
          <a href="/collections.html" style="color: #8B1A1A; font-weight: 700; font-size: 0.85rem; text-decoration: none;">★ View Full Collections Page ➔</a>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('is-open');
      }
    });

    const closeBtn = modal.querySelector('#btnCloseMobileCollectionsModal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('is-open');
      });
    }
  }

  // Bind trigger
  const triggerBtn = document.getElementById('btnTriggerMobileCollectionsModal');
  if (triggerBtn && !triggerBtn.dataset.bound) {
    triggerBtn.dataset.bound = 'true';
    triggerBtn.addEventListener('click', () => {
      renderModalCollectionsContent();
      const m = document.getElementById('mobileCollectionsModal');
      if (m) m.classList.add('is-open');
    });
  }
}

function renderModalCollectionsContent() {
  const stage = document.getElementById('modalCollectionsDualStage');
  if (!stage) return;
  if (!categoryStructure || categoryStructure.length === 0) return;

  let primaryHtml = '<div class="collections-primary-card hub-primary-card">';
  categoryStructure.forEach((cat, idx) => {
    const isActive = idx === 0 ? 'active' : '';
    primaryHtml += `
      <button type="button" class="collections-primary-link hub-cat-btn ${isActive}" data-cat="${cat.category}">
        <span>${cat.name}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    `;
  });
  primaryHtml += '</div>';

  let secondaryHtml = '<div class="hub-secondary-container">';
  categoryStructure.forEach((cat, idx) => {
    const isActive = idx === 0 ? 'active' : '';
    secondaryHtml += `
      <div class="collections-secondary-card hub-secondary-card ${isActive}" data-cat="${cat.category}">
        <div class="submenu-header-row">
          <span class="submenu-category-title">All ${cat.name}</span>
          <a href="/shop.html?cat=${encodeURIComponent(cat.category)}" class="submenu-view-all-pill">VIEW ALL</a>
        </div>
        <ul class="submenu-types-list">
    `;
    if (cat.types && cat.types.length > 0) {
      cat.types.forEach(t => {
        secondaryHtml += `<li><a href="/shop.html?type=${encodeURIComponent(t)}" class="submenu-type-link">${t}</a></li>`;
      });
    } else {
      secondaryHtml += `<li><a href="/shop.html?cat=${encodeURIComponent(cat.category)}" class="submenu-type-link">Explore Collection</a></li>`;
    }
    secondaryHtml += `
        </ul>
      </div>
    `;
  });
  secondaryHtml += '</div>';

  stage.innerHTML = primaryHtml + secondaryHtml;
  initCollectionsFlyout();
}



