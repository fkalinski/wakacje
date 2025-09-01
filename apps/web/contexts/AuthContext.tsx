'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

// Whitelisted users - easy to expand later
const ALLOWED_USERS = [
  'fkalinski@gmail.com'
  // Add more emails here as needed
];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthorized: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthorized: false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  error: null
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const isUserAllowed = (email: string | null): boolean => {
  if (!email) return false;
  return ALLOWED_USERS.includes(email.toLowerCase());
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Check if user is whitelisted
        const authorized = isUserAllowed(user.email);
        if (authorized) {
          setUser(user);
          setIsAuthorized(true);
          setError(null);
        } else {
          // Sign out non-whitelisted users immediately
          firebaseSignOut(auth);
          setUser(null);
          setIsAuthorized(false);
          setError(`Access denied for ${user.email}. This application is restricted to authorized users only.`);
        }
      } else {
        setUser(null);
        setIsAuthorized(false);
        setError(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    setLoading(true);
    
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Check if user is whitelisted
      if (!isUserAllowed(result.user.email)) {
        await firebaseSignOut(auth);
        setError(`Access denied for ${result.user.email}. This application is restricted to authorized users only.`);
        setIsAuthorized(false);
      }
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      setError(error.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setIsAuthorized(false);
      setError(null);
    } catch (error: any) {
      console.error('Error signing out:', error);
      setError(error.message || 'Failed to sign out');
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    loading,
    isAuthorized,
    signInWithGoogle,
    signOut,
    error
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};