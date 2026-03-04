import React from 'react';
import { fmt } from '../config';

/**
 * Displays a food item card with image, name, and price.
 * Used in the chat when browsing a category.
 */
export default function FoodCard({ item }) {
  if (!item.img) return null;

  return (
    <div className="food-card">
      <img src={item.img} alt={item.name} loading="lazy" />
      <div className="food-card-info">
        <div className="food-card-name">{item.name}</div>
        <div className="food-card-price">{fmt(item.price)}</div>
      </div>
    </div>
  );
}
