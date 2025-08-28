'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Building2, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface LoginFormData {
  email: string;
  password: string;
}

interface LoginError {
  message: string;
  field?: 'email' | 'password' | 'general';
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: ''
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const [mounted, setMounted] = useState(false);

  // Handle hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (mounted && !authLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [mounted, authLoading, isAuthenticated, router]);

  // Show loading during hydration or auth check
  if (!mounted || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Don't render if authenticated (will redirect)
  if (isAuthenticated) {
    return null;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear field-specific errors when user starts typing
    if (error?.field === name) {
      setError(null);
    }
  };

  const validateForm = (): boolean => {
    if (!formData.email) {
      setError({ message: 'Email is required', field: 'email' });
      return false;
    }

    if (!formData.email.includes('@')) {
      setError({ message: 'Please enter a valid email address', field: 'email' });
      return false;
    }

    if (!formData.password) {
      setError({ message: 'Password is required', field: 'password' });
      return false;
    }

    if (formData.password.length < 6) {
      setError({ message: 'Password must be at least 6 characters', field: 'password' });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      await login(formData);
      // Router will redirect automatically via useEffect
    } catch (err: any) {
      console.error('Login error:', err);
      
      // Handle different types of errors
      let errorMessage = 'Login failed. Please try again.';
      
      if (err.message) {
        if (err.message.includes('Invalid email or password')) {
          errorMessage = 'Invalid email or password. Please check your credentials.';
        } else if (err.message.includes('Too many')) {
          errorMessage = 'Too many login attempts. Please try again later.';
        } else {
          errorMessage = err.message;
        }
      }

      setError({ message: errorMessage, field: 'general' });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // Pre-fill admin credentials for testing (remove in production)
  const fillAdminCredentials = () => {
    setFormData({
      email: 'admin@uspto-tsdr.com',
      password: 'admin123'
    });
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h1>
          <p className="text-gray-600">Sign in to your USPTO TSDR Dashboard</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* General Error */}
            {error?.field === 'general' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-red-700 text-sm">{error.message}</p>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={cn(
                  "w-full px-4 py-3 border rounded-lg transition-colors duration-200",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  error?.field === 'email' 
                    ? "border-red-300 bg-red-50" 
                    : "border-gray-300 hover:border-gray-400"
                )}
                placeholder="Enter your email"
                disabled={isLoading}
                autoComplete="email"
              />
              {error?.field === 'email' && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {error.message}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className={cn(
                    "w-full px-4 py-3 border rounded-lg pr-12 transition-colors duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                    error?.field === 'password' 
                      ? "border-red-300 bg-red-50" 
                      : "border-gray-300 hover:border-gray-400"
                  )}
                  placeholder="Enter your password"
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {error?.field === 'password' && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {error.message}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                "w-full py-3 px-4 rounded-lg font-medium text-white transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                isLoading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 transform hover:scale-[1.02]"
              )}
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing In...</span>
                </div>
              ) : (
                'Sign In'
              )}
            </button>

            {/* Development Helper */}
            {process.env.NODE_ENV === 'development' && (
              <div className="pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2 text-center">Development Mode</p>
                <button
                  type="button"
                  onClick={fillAdminCredentials}
                  className="w-full py-2 px-4 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={isLoading}
                >
                  Fill Admin Credentials
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            Need help? Contact your system administrator
          </p>
        </div>
      </div>
    </div>
  );
}