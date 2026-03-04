/* ─── Menu Data (sourced from Joma CIS ipos.vn) ─── */

const WIX = (id) =>
  `https://static.wixstatic.com/media/${id}/v1/fill/w_200,h_200,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/${id.split('~')[0]}.jpg`;

const CATEGORIES = [
  {
    name: 'Breakfast',
    icon: '🍳',
    items: [
      { name: 'Eggs, Toast & Bacon', price: 95000, img: WIX('c6c9be_caf082fe8cc34df8829388f0af094406~mv2.jpg') },
      { name: 'Breakfast Burrito', price: 105000, img: WIX('c6c9be_9d507de65df94b2ca8371941ab979c14~mv2.jpg') },
      { name: 'Oat French Toast with Mango', price: 95000, img: WIX('c6c9be_9dd6664f51004b76ac09645b84c2e01d~mv2.jpg') },
      { name: 'Bagel & Cream Cheese', price: 55000, img: WIX('c6c9be_38ad859530154b1db0bbab5add75ce5f~mv2.jpg') },
      { name: 'Fruit Salad', price: 65000, img: WIX('c6c9be_54719f630e42427293f6f32901f94780~mv2.jpg') },
    ],
  },
  {
    name: 'Sandwiches',
    icon: '🥪',
    items: [
      { name: 'The Nova Scotia', price: 145000 },
      { name: 'Chicken Pesto Sandwich', price: 115000 },
      { name: 'BLT on Focaccia', price: 105000 },
      { name: 'Italian Croissant', price: 95000 },
      { name: 'Turkey Club Sandwich', price: 115000 },
      { name: 'Cheese Steak Sandwich', price: 120000 },
      { name: 'Egg & Bacon Bagel', price: 85000 },
    ],
  },
  {
    name: 'Soups & Salads',
    icon: '🥗',
    items: [
      { name: 'Beef and Bean Chili Soup', price: 85000, img: WIX('c6c9be_69c76312cb644f9a853d9c65dd3487c8~mv2.jpg') },
      { name: 'Pumpkin Soup', price: 75000, img: WIX('c6c9be_ddcc07ccef3645dcb467a6087c1b0b14~mv2.jpg') },
      { name: 'Bacon and Potato Soup', price: 80000, img: WIX('c6c9be_fe634ebf05fd43cb90ce7a1640d911e7~mv2.jpg') },
      { name: 'Cream of Tomato Soup', price: 75000, img: WIX('c6c9be_1c78e650daee405185446df931052bc6~mv2.jpg') },
      { name: 'Caesar Salad', price: 95000 },
      { name: 'Garden Salad', price: 85000 },
    ],
  },
  {
    name: 'Coffee',
    icon: '☕',
    items: [
      { name: 'Americano', price: 45000 },
      { name: 'Latte', price: 55000 },
      { name: 'Cappuccino', price: 55000 },
      { name: 'Mocha', price: 60000 },
      { name: 'Espresso', price: 40000 },
      { name: 'Vietnamese Iced Coffee', price: 45000 },
    ],
  },
  {
    name: 'Cold Drinks',
    icon: '🧊',
    items: [
      { name: 'Lemon Cold Brew', price: 65000, img: WIX('c6c9be_0a44028f58c446c99bb4780613c6bf1c~mv2.jpg') },
      { name: 'Coconut Cream Cold Brew', price: 65000, img: WIX('c6c9be_cd711a1a3baf4a3a9bf41041d1939ce9~mv2.jpg') },
      { name: 'Ice Chai Tea Latte', price: 55000, img: WIX('c6c9be_783c59adeb164237bc91ba485b80d61e~mv2.jpg') },
      { name: 'Iced Americano', price: 50000 },
      { name: 'Iced Latte', price: 60000 },
      { name: 'Iced Mocha', price: 65000 },
    ],
  },
  {
    name: 'Smoothies',
    icon: '🥤',
    items: [
      { name: 'Chocolate Banana Oat Smoothie', price: 65000, img: WIX('c6c9be_686e9111007a40c3ae5caed6df2e55ce~mv2.jpg') },
      { name: 'Green Smoothie', price: 65000, img: WIX('c6c9be_6d69e21db2c14705b833718a49c48e54~mv2.jpg') },
      { name: 'Mango Passion Smoothie', price: 65000, img: WIX('c6c9be_6cdc5e864c974db98c55527279e0e239~mv2.jpg') },
      { name: 'Strawberry Banana Smoothie', price: 65000, img: WIX('c6c9be_c3dc5e7f394f4f1e87ea762c8d251c16~mv2.jpg') },
    ],
  },
  {
    name: 'Teas & Other',
    icon: '🍵',
    items: [
      { name: 'Mango Earl Grey Tea', price: 50000, img: WIX('c6c9be_f02f0ba6c432451e89027b4f9bed7523~mv2.jpg') },
      { name: 'Chai Tea Latte', price: 50000 },
      { name: 'London Fog', price: 55000 },
      { name: 'Green Tea', price: 40000 },
      { name: 'Hot Chocolate', price: 50000 },
      { name: 'Fresh Orange Juice', price: 55000 },
    ],
  },
  {
    name: 'Baked Goods & Cakes',
    icon: '🥐',
    items: [
      { name: 'Croissant', price: 35000 },
      { name: 'Chocolate Croissant', price: 40000 },
      { name: 'Cinnamon Bun', price: 45000 },
      { name: 'Blueberry Muffin', price: 40000 },
      { name: 'Pumpkin Cream Cheese Muffin', price: 45000 },
      { name: 'Chocolate Chip Cookie', price: 25000 },
      { name: 'Banana Bread', price: 35000 },
      { name: 'Brownie', price: 40000 },
      { name: 'Cheesecake Slice', price: 55000 },
      { name: 'Chocolate Cake Slice', price: 50000 },
      { name: 'Carrot Cake Slice', price: 50000 },
      { name: 'Apple Fritter', price: 40000 },
    ],
  },
];

export default CATEGORIES;
