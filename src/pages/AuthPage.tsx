import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Mail, ArrowRight, Loader2, ShieldCheck, Eye, EyeOff, CheckCircle2, User } from 'lucide-react';
import heroBanner from '@/assets/hero-banner.jpg';

type SignupStep = 'credentials' | 'profile' | 'verification';

interface ProfileData {
  name: string;
  flat_number: string;
  block: string;
  phase: string;
  phone: string;
}

export default function AuthPage() {
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [signupStep, setSignupStep] = useState<SignupStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({
    name: '',
    flat_number: '',
    block: '',
    phase: '',
    phone: '',
  });

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleLogin = async () => {
    if (!validateEmail(email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      // Check if profile exists
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user?.id)
        .single();

      if (profile) {
        toast.success('Welcome back!');
        navigate('/');
      } else {
        // User logged in but has no profile - show profile form
        setAuthMode('signup');
        setSignupStep('profile');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.message.includes('Invalid login')) {
        toast.error('Invalid email or password');
      } else if (error.message.includes('Email not confirmed')) {
        toast.error('Please verify your email address first. Check your inbox.');
      } else {
        toast.error(error.message || 'Failed to login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Collect email and password, then move to profile
  const handleCredentialsNext = () => {
    if (!validateEmail(email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setSignupStep('profile');
  };

  // Step 2: Collect profile data, then create account
  const handleSignupComplete = async () => {
    if (!profileData.name || !profileData.flat_number || !profileData.block || !profileData.phase || !profileData.phone) {
      toast.error('Please fill in all fields');
      return;
    }

    if (profileData.phone.length !== 10) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }

    setIsLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/auth`;
      
      // Create the user account
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            name: profileData.name,
            phone: `+91${profileData.phone}`,
            flat_number: profileData.flat_number,
            block: profileData.block,
            phase: profileData.phase,
          }
        },
      });

      if (error) throw error;

      if (data.user) {
        // Check if user needs email confirmation
        if (data.user.identities?.length === 0) {
          toast.error('This email is already registered. Please login instead.');
          setAuthMode('login');
          setSignupStep('credentials');
          return;
        }

        // Try to create profile immediately (will work if email confirmation is disabled)
        try {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              phone: `+91${profileData.phone}`,
              name: profileData.name,
              flat_number: profileData.flat_number,
              block: profileData.block,
              phase: profileData.phase,
            });

          if (!profileError) {
            // Create default buyer role
            await supabase
              .from('user_roles')
              .insert({
                user_id: data.user.id,
                role: 'buyer',
              });
          }
        } catch (e) {
          // Profile creation might fail if email needs verification - that's ok
          console.log('Profile will be created after email verification');
        }

        // Show verification step
        setSignupStep('verification');
        toast.success('Please check your email to verify your account');
      }
    } catch (error: any) {
      console.error('Signup error:', error);
      if (error.message.includes('already registered')) {
        toast.error('This email is already registered. Please login instead.');
        setAuthMode('login');
        setSignupStep('credentials');
      } else {
        toast.error(error.message || 'Failed to create account');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.slice(0, 10);
  };

  const blocks = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const phases = ['Phase 1', 'Phase 2'];

  const resetSignup = () => {
    setSignupStep('credentials');
    setEmail('');
    setPassword('');
    setProfileData({
      name: '',
      flat_number: '',
      block: '',
      phase: '',
      phone: '',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative h-48 overflow-hidden">
        <img
          src={heroBanner}
          alt="Community marketplace"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-background" />
        <div className="absolute bottom-4 left-4 right-4">
          <h1 className="text-2xl font-bold text-white drop-shadow-lg">
            BlockEats
          </h1>
          <p className="text-sm text-white/90 drop-shadow">
            Shriram Greenfield Marketplace
          </p>
        </div>
      </div>

      {/* Community Notice Banner */}
      <div className="mx-4 -mt-2 mb-2 relative z-5">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
          <p className="text-xs text-amber-800 font-medium">
            🏠 This app is exclusively for Shriram Greenfield residents
          </p>
        </div>
      </div>

      <div className="px-4 -mt-4 relative z-10">
        <Card className="shadow-elevated">
          <CardHeader className="text-center pb-2">
            {authMode === 'login' && (
              <>
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <Mail className="text-primary" size={24} />
                </div>
                <CardTitle>Welcome Back</CardTitle>
                <CardDescription>Login to your account</CardDescription>
              </>
            )}
            {authMode === 'signup' && signupStep === 'credentials' && (
              <>
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <Mail className="text-primary" size={24} />
                </div>
                <CardTitle>Create Account</CardTitle>
                <CardDescription>Step 1 of 3: Enter your email</CardDescription>
              </>
            )}
            {authMode === 'signup' && signupStep === 'profile' && (
              <>
                <div className="mx-auto w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-2">
                  <User className="text-success" size={24} />
                </div>
                <CardTitle>Your Details</CardTitle>
                <CardDescription>Step 2 of 3: Tell us about yourself</CardDescription>
              </>
            )}
            {authMode === 'signup' && signupStep === 'verification' && (
              <>
                <div className="mx-auto w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-2">
                  <CheckCircle2 className="text-success" size={24} />
                </div>
                <CardTitle>Verify Your Email</CardTitle>
                <CardDescription>Step 3 of 3: Check your inbox</CardDescription>
              </>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Login Form */}
            {authMode === 'login' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <Button
                  onClick={handleLogin}
                  disabled={!email || !password || isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <Loader2 className="animate-spin mr-2" size={18} />
                  ) : (
                    <ArrowRight className="mr-2" size={18} />
                  )}
                  Login
                </Button>
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signup');
                      resetSignup();
                    }}
                    className="text-sm text-primary hover:underline"
                  >
                    Don't have an account? Sign up
                  </button>
                </div>
              </>
            )}

            {/* Signup Step 1: Credentials */}
            {authMode === 'signup' && signupStep === 'credentials' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a password (min 6 chars)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    At least 6 characters
                  </p>
                </div>
                <Button
                  onClick={handleCredentialsNext}
                  disabled={!email || password.length < 6}
                  className="w-full"
                >
                  <ArrowRight className="mr-2" size={18} />
                  Continue
                </Button>
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode('login')}
                    className="text-sm text-primary hover:underline"
                  >
                    Already have an account? Login
                  </button>
                </div>
              </>
            )}

            {/* Signup Step 2: Profile Details */}
            {authMode === 'signup' && signupStep === 'profile' && (
              <>
                {/* Progress indicator */}
                <div className="flex items-center justify-center gap-2 pb-2">
                  <div className="w-8 h-1 rounded-full bg-primary" />
                  <div className="w-8 h-1 rounded-full bg-primary" />
                  <div className="w-8 h-1 rounded-full bg-muted" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="Enter your name"
                    value={profileData.name}
                    onChange={(e) =>
                      setProfileData({ ...profileData, name: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="flex gap-2">
                    <div className="flex items-center px-3 bg-muted rounded-md border border-input text-sm font-medium">
                      +91
                    </div>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="10-digit number"
                      value={profileData.phone}
                      onChange={(e) =>
                        setProfileData({ ...profileData, phone: formatPhone(e.target.value) })
                      }
                      maxLength={10}
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phase">Phase</Label>
                  <select
                    id="phase"
                    value={profileData.phase}
                    onChange={(e) =>
                      setProfileData({ ...profileData, phase: e.target.value })
                    }
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">Select Phase</option>
                    {phases.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="block">Block</Label>
                    <select
                      id="block"
                      value={profileData.block}
                      onChange={(e) =>
                        setProfileData({ ...profileData, block: e.target.value })
                      }
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="">Select</option>
                      {blocks.map((b) => (
                        <option key={b} value={b}>
                          Block {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="flat">Flat Number</Label>
                    <Input
                      id="flat"
                      placeholder="e.g., 101"
                      value={profileData.flat_number}
                      onChange={(e) =>
                        setProfileData({ ...profileData, flat_number: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSignupStep('credentials')}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleSignupComplete}
                    disabled={
                      !profileData.name ||
                      !profileData.flat_number ||
                      !profileData.block ||
                      !profileData.phase ||
                      profileData.phone.length !== 10 ||
                      isLoading
                    }
                    className="flex-1"
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin mr-2" size={18} />
                    ) : null}
                    Create Account
                  </Button>
                </div>
              </>
            )}

            {/* Signup Step 3: Email Verification */}
            {authMode === 'signup' && signupStep === 'verification' && (
              <>
                {/* Progress indicator */}
                <div className="flex items-center justify-center gap-2 pb-2">
                  <div className="w-8 h-1 rounded-full bg-primary" />
                  <div className="w-8 h-1 rounded-full bg-primary" />
                  <div className="w-8 h-1 rounded-full bg-primary" />
                </div>

                <div className="text-center py-4 space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                    <Mail className="text-success" size={32} />
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">Check your email</p>
                    <p className="text-sm text-muted-foreground">
                      We've sent a verification link to:
                    </p>
                    <p className="text-sm font-medium text-primary">{email}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-left text-sm space-y-2">
                    <p className="font-medium">What happens next?</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Click the link in your email</li>
                      <li>You'll be redirected back here</li>
                      <li>Login with your credentials</li>
                      <li>Admin will verify your residency</li>
                    </ol>
                  </div>
                </div>

                <Button
                  onClick={() => {
                    setAuthMode('login');
                    resetSignup();
                  }}
                  className="w-full"
                >
                  Go to Login
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Didn't receive the email?{' '}
                  <button
                    type="button"
                    onClick={() => toast.info('Please check your spam folder or try signing up again.')}
                    className="text-primary hover:underline"
                  >
                    Get help
                  </button>
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground mt-6 px-4 space-y-2">
          <p>
            By continuing, you agree to our{' '}
            <a href="/terms" className="text-primary underline">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy-policy" className="text-primary underline">Privacy Policy</a>.
          </p>
          <p className="font-medium">
            This marketplace is exclusively for Shriram Greenfield residents.
          </p>
        </div>
      </div>
    </div>
  );
}
