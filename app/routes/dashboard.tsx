import { useState, useEffect } from 'react';
import { useLoaderData } from '@remix-run/react';
import prisma from '../db.server';

// Mock data for now
const mockData = {
  totalCustomers: 142,
  totalOrders: 287,
  totalRevenue: 15423.50,
  recentOrders: [
    { id: 1, total: 129.99, status: 'paid', date: '2025-09-12' },
    { id: 2, total: 89.50, status: 'paid', date: '2025-09-11' },
  ]
};

export default function Dashboard() {
  const [data, setData] = useState(mockData);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">📊 Business Dashboard</h1>
      
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold">Total Customers</h2>
          <p className="text-3xl">{data.totalCustomers}</p>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold">Total Orders</h2>
          <p className="text-3xl">{data.totalOrders}</p>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold">Total Revenue</h2>
          <p className="text-3xl">${data.totalRevenue}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-lg font-semibold mb-4">Recent Orders</h2>
        <table className="w-full">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.recentOrders.map(order => (
              <tr key={order.id}>
                <td>#{order.id}</td>
                <td>${order.total}</td>
                <td>{order.status}</td>
                <td>{order.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}