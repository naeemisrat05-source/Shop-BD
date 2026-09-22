import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, isFirebaseAvailable, ADMIN_UID, ADMIN_EMAIL } from '../lib/firebase/client';
import { UserProfile, BangladeshAddress } from '../types';

export const isAuthorizedAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  const configured = (ADMIN_EMAIL || '').toLowerCase().trim();
  return (
    clean === configured ||
    clean === 'naeemmusic2.0@gmail.com' ||
    clean === 'naeemisrat05@gmail.com' ||
    clean === 'admin@shopbd.com'
  );
};

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (name: string, email: string, phone: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  updateAddresses: (addresses: BangladeshAddress[]) => Promise<void>;
  updateProfileInfo: (name: string, phone: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('shopbd_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(true);

  // Determine admin rights
  const isAdmin = Boolean(
    user && (
      user.role === 'admin' ||
      user.uid === ADMIN_UID ||
      isAuthorizedAdminEmail(user.email)
    )
  );

  useEffect(() => {
    if (user) {
      localStorage.setItem('shopbd_current_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('shopbd_current_user');
    }
  }, [user]);

  useEffect(() => {
    if (!isFirebaseAvailable || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (fbUser) {
        try {
          // Check firestore user doc
          let profile: UserProfile | null = null;
          if (db) {
            const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
            if (userDoc.exists()) {
              profile = userDoc.data() as UserProfile;
            }
          }

          const isEmailAdmin = Boolean(
            fbUser.uid === ADMIN_UID ||
            isAuthorizedAdminEmail(fbUser.email)
          );

          if (profile) {
            if (isEmailAdmin && profile.role !== 'admin') {
              profile = { ...profile, role: 'admin' };
              if (db) {
                await setDoc(doc(db, 'users', fbUser.uid), { role: 'admin' }, { merge: true });
              }
            }
          } else {
            const role = isEmailAdmin ? 'admin' : 'customer';
            profile = {
              uid: fbUser.uid,
              name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
              email: fbUser.email || '',
              role,
              photoURL: fbUser.photoURL || undefined,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            if (db) {
              await setDoc(doc(db, 'users', fbUser.uid), profile);
            }
          }
          setUser(profile);
        } catch (e) {
          console.warn('Error fetching user profile:', e);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      if (isFirebaseAvailable && auth) {
        await signInWithEmailAndPassword(auth, email, pass);
      } else {
        throw new Error('Firebase authentication service is not connected.');
      }
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        throw new Error('Invalid email or password. If this is your first time, please create an admin account or set a password.');
      }
      throw new Error(err instanceof Error ? err.message : 'Invalid login credentials');
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      if (isFirebaseAvailable && auth) {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const fbUser = result.user;
        const isEmailAdmin = Boolean(
          fbUser.uid === ADMIN_UID ||
          isAuthorizedAdminEmail(fbUser.email)
        );

        let profile: UserProfile | null = null;
        if (db) {
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            profile = userDoc.data() as UserProfile;
          }
        }

        if (profile) {
          if (isEmailAdmin && profile.role !== 'admin') {
            profile = { ...profile, role: 'admin' };
            if (db) {
              await setDoc(doc(db, 'users', fbUser.uid), { role: 'admin' }, { merge: true });
            }
          }
        } else {
          profile = {
            uid: fbUser.uid,
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
            email: fbUser.email || '',
            role: isEmailAdmin ? 'admin' : 'customer',
            photoURL: fbUser.photoURL || undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          if (db) {
            await setDoc(doc(db, 'users', fbUser.uid), profile);
          }
        }
        setUser(profile);
      } else {
        throw new Error('Firebase authentication service is not connected.');
      }
    } catch (err: any) {
      throw new Error(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const register = async (name: string, email: string, phone: string, pass: string) => {
    setLoading(true);
    try {
      if (isFirebaseAvailable && auth) {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const isEmailAdmin = Boolean(
          cred.user.uid === ADMIN_UID ||
          isAuthorizedAdminEmail(email)
        );
        const newProfile: UserProfile = {
          uid: cred.user.uid,
          name,
          email,
          phone,
          role: isEmailAdmin ? 'admin' : 'customer',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (db) {
          await setDoc(doc(db, 'users', cred.user.uid), newProfile);
        }
        setUser(newProfile);
      } else {
        throw new Error('Firebase authentication service is not connected.');
      }
    } catch (err: any) {
      if (err?.code === 'auth/email-already-in-use') {
        throw new Error('This email is already registered. Please sign in with your password.');
      }
      throw new Error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (isFirebaseAvailable && auth) {
        await signOut(auth);
      }
    } catch (e) {
      console.warn('SignOut error:', e);
    } finally {
      setUser(null);
      localStorage.removeItem('shopbd_current_user');
    }
  };

  const updateAddresses = async (addresses: BangladeshAddress[]) => {
    if (!user) return;
    const updated = { ...user, addresses, updatedAt: new Date().toISOString() };
    setUser(updated);
    if (isFirebaseAvailable && db) {
      try {
        await setDoc(doc(db, 'users', user.uid), updated, { merge: true });
      } catch (e) {
        console.warn('Address update error:', e);
      }
    }
  };

  const updateProfileInfo = async (name: string, phone: string) => {
    if (!user) return;
    const updated = { ...user, name, phone, updatedAt: new Date().toISOString() };
    setUser(updated);
    if (isFirebaseAvailable && db) {
      try {
        await setDoc(doc(db, 'users', user.uid), updated, { merge: true });
      } catch (e) {
        console.warn('Profile update error:', e);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        login,
        loginWithGoogle,
        register,
        logout,
        updateAddresses,
        updateProfileInfo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
