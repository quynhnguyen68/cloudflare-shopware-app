-- Migration number: 0001 	 2024-06-26T09:12:22.634Z
CREATE TABLE reports (
  order_id SERIAL PRIMARY KEY,
  shop_id SERIAL NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);