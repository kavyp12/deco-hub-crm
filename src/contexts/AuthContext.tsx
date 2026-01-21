import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '@/lib/api';

type AppRole = 'super_admin' | 'sales' | 'accounting' | 'admin_hr';

interface Profile {
  id: string;
  name: string;
  email: string;
  mobile_number: string | null;
}

interface AuthContextType {
  user: any | null; // Using any to match flexible user object
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.get('/auth/me');
        setUser(data);
        setProfile(data); // In your schema, user and profile are the same table
        setRole(data.role as AppRole);
      } catch (error) {
        console.error("Session expired or invalid");
        localStorage.removeItem('token');
        setUser(null);
        setProfile(null);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', data.token);
      
      setUser(data.user);
      setProfile(data.user);
      setRole(data.user.role as AppRole);
      
      return { error: null };
    } catch (error: any) {
      return { 
        error: new Error(error.response?.data?.error || 'Invalid credentials') 
      };
    }
  };

  const signOut = async () => {
    localStorage.removeItem('token');
    setUser(null);
    setProfile(null);
    setRole(null);
    window.location.href = '/auth'; // Hard redirect to ensure clean state
  };

  const value = {
    user,
    profile,
    role,
    loading,
    signIn,
    signOut,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};