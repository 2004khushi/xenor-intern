import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState, useEffect } from "react";

import { login } from "../../shopify.server";
import styles from "./styles.module.css";

import yellowSnowboard from "../assets/snowboard.png";
import carbonSkis from "../assets/bindings.png";
import winterGloves from "../assets/boots.png";
import sportsHelmet from "../assets/goggles.png";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  const [products, setProducts] = useState([
    {
      id: 1,
      name: "Yellow Snowboard",
      description: "Hit the slopes in style with the eye-catching Yellow Snowboard! Designed for both performance and visibility, this board features a vibrant yellow finish that will make you stand out on any mountain. Crafted with a lightweight yet durable core, it offers excellent control and responsiveness, perfect for carving precise turns or gliding through fresh powder.",
      price: "₹11,100.00",
      stock: 12,
      orders: 45,
      image: yellowSnowboard
    },
    {
      id: 2,
      name: "Yellow Snowboard Bindings",
      description: "Complement your Yellow Snowboard with our matching high-performance Yellow Snowboard Bindings. Engineered for optimal power transfer and comfort, these bindings provide a secure and responsive connection between you and your board. Featuring adjustable straps and a lightweight design, they ensure maximum control and support, allowing you to tackle any terrain with confidence and flair. The vibrant yellow accents perfectly tie into your setup.",
      price: "₹1,001.00",
      stock: 8,
      orders: 32,
      image: carbonSkis
    },
    {
      id: 3,
      name: "Yellow Snowboard Boots",
      description: "Step into comfort and control with our sleek Yellow Snowboard Boots. Designed for all-day warmth and support, these boots feature a comfortable liner and a responsive outer shell that works in harmony with your bindings and board. The distinctive yellow highlights offer a bold look while advanced lacing systems ensure a snug, personalized fit. Dominate the mountain from the first run to the last.",
      price: "₹20,001.00",
      stock: 25,
      orders: 78,
      image: winterGloves
    },
    {
      id: 4,
      name: "Yellow Snowboard Goggles",
      description: "See clearly and ride safely with our stylish Yellow Snowboard Goggles. Featuring anti-fog, UV-protective lenses and a comfortable, adjustable strap, these goggles offer superior visibility in varying light conditions. The vibrant yellow frame adds a pop of color to your gear, ensuring you look good while staying protected from sun, snow, and wind.",
      price: "₹10,001.00",
      stock: 3,
      orders: 3,
      image: sportsHelmet
    }
  ]);

  // Simulate real-time inventory updates
  useEffect(() => {
    const interval = setInterval(() => {
      setProducts(prevProducts => 
        prevProducts.map(product => {
          // Random chance to decrease stock
          if (product.stock > 0 && Math.random() > 0.9) {
            return {
              ...product,
              stock: product.stock - 1,
              orders: product.orders + 1
            };
          }
          return product;
        })
      );
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ 
      backgroundColor: '#0a0a0a', 
      color: 'white', 
      minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
      padding: '0',
      margin: '0'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        {/* Header */}
        <header style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '20px 0', 
          borderBottom: '1px solid #222', 
          marginBottom: '40px' 
        }}>
          <div style={{ 
            fontSize: '28px', 
            fontWeight: '800', 
            color: '#ffdd00', 
            display: 'flex', 
            alignItems: 'center',
            letterSpacing: '1px'
          }}>
            <span style={{ marginRight: '10px', filter: 'drop-shadow(0 0 5px rgba(255, 221, 0, 0.5))' }}>❄️</span>
            XENO SPORTS
          </div>
          <nav>
            <ul style={{ display: 'flex', listStyle: 'none', gap: '30px' }}>
              {['Home', 'Products', 'About', 'Contact'].map((item) => (
                <li key={item}>
                  <a href="#" style={{ 
                    color: '#fff', 
                    textDecoration: 'none', 
                    fontWeight: '500',
                    fontSize: '16px',
                    transition: 'color 0.3s',
                    padding: '8px 0',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ffdd00';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#fff';
                  }}
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        {/* Hero Section */}
        <section style={{ 
          textAlign: 'center', 
          padding: '60px 0', 
          marginBottom: '50px',
          background: 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 100%)',
          borderRadius: '16px',
          border: '1px solid #222'
        }}>
          <h1 style={{ 
            fontSize: '3.5rem', 
            marginBottom: '20px', 
            background: 'linear-gradient(45deg, #ffdd00, #ffaa00)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: '800',
            letterSpacing: '-0.5px',
            lineHeight: '1.1',
            textShadow: '0 2px 10px rgba(255, 221, 0, 0.3)'
          }}>
            Xeno: The Future of the Ride
          </h1>
          <p style={{ 
            fontSize: '1.2rem', 
            maxWidth: '800px', 
            margin: '0 auto 30px', 
            color: '#ccc',
            lineHeight: '1.6'
          }}>
            Welcome to Xeno, where innovation meets adventure. We are pioneers in performance-driven winter sports gear, constantly pushing the boundaries of design and technology to elevate your experience on the slopes.
          </p>
          
          {showForm && (
            <a
              href="https://xenor-intern-r13vcgq57-khushis-projects-ea0259c2.vercel.app/login"
              target="_self"
              style={{ 
                display: 'inline-block', 
                background: 'linear-gradient(45deg, #ffdd00, #ffaa00)', 
                color: '#000', 
                padding: '16px 42px', 
                borderRadius: '30px', 
                textDecoration: 'none', 
                fontWeight: '700', 
                fontSize: '1.1rem',
                boxShadow: '0 4px 15px rgba(255, 221, 0, 0.3)',
                transition: 'transform 0.3s, box-shadow 0.3s',
                letterSpacing: '0.5px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 221, 0, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 221, 0, 0.3)';
              }}
            >
              Log in to Shop
            </a>
          )}
        </section>

        {/* Products Section */}
        <section style={{ marginBottom: '60px' }}>
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <h2 style={{ 
              fontSize: '2.5rem', 
              marginBottom: '15px', 
              color: '#ffdd00',
              fontWeight: '700'
            }}>
              Featured Collection
            </h2>
            <p style={{ 
              color: '#aaa', 
              maxWidth: '600px', 
              margin: '0 auto',
              fontSize: '1.1rem'
            }}>
              Discover our cutting-edge equipment crafted for those who dare to stand out and carve their own path.
            </p>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
            gap: '30px', 
            marginBottom: '60px' 
          }}>
            {products.map(product => (
              <div key={product.id} style={{ 
                background: '#111', 
                borderRadius: '16px', 
                overflow: 'hidden', 
                transition: 'transform 0.3s, box-shadow 0.3s', 
                boxShadow: '0 5px 15px rgba(0, 0, 0, 0.5)',
                cursor: 'pointer',
                border: '1px solid #222'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-10px)';
                e.currentTarget.style.boxShadow = '0 15px 30px rgba(255, 221, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.5)';
              }}
              >
                <div style={{ 
                  height: '220px', 
                  background: `url(${product.image}) center/cover`,
                  position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '15px',
                    right: '15px',
                    background: 'rgba(0,0,0,0.7)',
                    color: '#ffdd00',
                    padding: '5px 10px',
                    borderRadius: '20px',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}>
                    ${product.price.split('.')[0]}
                  </div>
                </div>
                <div style={{ padding: '25px' }}>
                  <h3 style={{ 
                    fontSize: '1.5rem', 
                    marginBottom: '12px', 
                    color: '#ffdd00',
                    fontWeight: '700'
                  }}>
                    {product.name}
                  </h3>
                  <p style={{ 
                    color: '#ccc', 
                    marginBottom: '20px', 
                    fontSize: '0.95rem',
                    lineHeight: '1.6'
                  }}>
                    {product.description}
                  </p>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    color: '#888', 
                    fontSize: '0.9rem', 
                    borderTop: '1px solid #222', 
                    paddingTop: '15px',
                    alignItems: 'center'
                  }}>
                    <span>
                      <span style={{ color: '#ffdd00', fontWeight: '600' }}>In Stock:</span> {product.stock}
                    </span>
                    <span>
                      <span style={{ color: '#ffdd00', fontWeight: '600' }}>Orders:</span> {product.orders}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features Section */}
        <section style={{ 
          background: 'linear-gradient(135deg, #111 0%, #0a0a0a 100%)', 
          padding: '60px 40px', 
          borderRadius: '16px', 
          marginBottom: '60px',
          border: '1px solid #222'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <h2 style={{ 
              fontSize: '2.5rem', 
              marginBottom: '15px', 
              color: '#ffdd00',
              fontWeight: '700'
            }}>
              Why Choose Xeno?
            </h2>
            <p style={{ 
              color: '#aaa', 
              maxWidth: '600px', 
              margin: '0 auto',
              fontSize: '1.1rem'
            }}>
              We're committed to excellence in every product we create
            </p>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: '30px' 
          }}>
            {[
              { icon: '⚡', title: 'Advanced Technology', desc: 'Our products incorporate the latest materials and engineering for superior performance.' },
              { icon: '🚀', title: 'Elite Performance', desc: 'Designed by professionals for athletes who demand the very best in their gear.' },
              { icon: '🛡️', title: 'Premium Safety', desc: 'Rigorously tested to ensure maximum protection without compromising comfort.' }
            ].map((feature, index) => (
              <div key={index} style={{ 
                textAlign: 'center', 
                padding: '30px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '12px',
                border: '1px solid #222'
              }}>
                <div style={{ 
                  fontSize: '50px', 
                  marginBottom: '20px',
                  filter: 'drop-shadow(0 0 5px rgba(255, 221, 0, 0.5))'
                }}>
                  {feature.icon}
                </div>
                <h3 style={{ 
                  fontSize: '1.4rem', 
                  marginBottom: '15px',
                  color: '#ffdd00'
                }}>
                  {feature.title}
                </h3>
                <p style={{ color: '#ccc', lineHeight: '1.6' }}>
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer style={{ 
          textAlign: 'center', 
          padding: '40px 0', 
          borderTop: '1px solid #222', 
          color: '#888', 
          marginTop: '60px' 
        }}>
          <div style={{ marginBottom: '20px' }}>
            {['📱', '📘', '🐦', '📺'].map((icon, index) => (
              <a key={index} href="#" style={{ 
                color: '#ffdd00', 
                fontSize: '1.5rem', 
                margin: '0 15px',
                transition: 'transform 0.3s',
                display: 'inline-block'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-5px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              >
                {icon}
              </a>
            ))}
          </div>
          <p style={{ fontSize: '0.9rem' }}>
            &copy; 2023 Xeno Snowboards. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}




//kya hua bhai