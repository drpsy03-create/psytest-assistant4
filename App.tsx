import { useState, useEffect, useRef } from 'react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Shield, Stethoscope, LogOut, Eye, EyeOff, ArrowLeft, UserCheck, Mail, Clock, RefreshCw } from 'lucide-react';
import { SmartPatientInterface } from './components/SmartPatientInterface';
import { DoctorDashboard } from './components/DoctorDashboard';
import { EmailNotificationDemo } from './components/EmailNotificationDemo';
import { emailService } from './services/emailService';
// Email status check initialization is done in useEffect to avoid SSR issues

type AppState = 'home' | 'screening' | 'doctor' | 'doctor-auth';

interface User {
  role: 'doctor' | 'patient';
  name: string;
  id: string;
}

interface Doctor {
  id: string;
  email: string;
  name: string;
  password: string;
  specialty?: string;
  clinic?: string;
  registrationDate: string;
  isVerified: boolean;
  verificationCode?: string;
  verificationExpiry?: string;
}

interface TestResult {
  id: string;
  patientName: string;
  patientId: string;
  accessCode: string;
  testType: string;
  score: number;
  severity: 'mild' | 'moderate' | 'severe' | 'normal';
  date: string;
  aiAnalysis: string;
  recommendations: string[];
  rawResults?: any;
}

interface AccessCode {
  id: string;
  code: string;
  patientName: string;
  createdDate: string;
  expiryDate: string;
  isActive: boolean;
  usedDate?: string;
  testResults?: number;
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('home');
  const [patientName, setPatientName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [user, setUser] = useState<User | null>(null);
  
  // Doctor auth states
  const [doctorEmail, setDoctorEmail] = useState('');
  const [doctorPassword, setDoctorPassword] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorSpecialty, setDoctorSpecialty] = useState('');
  const [doctorClinic, setDoctorClinic] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [registrationStep, setRegistrationStep] = useState<'form' | 'verification' | 'success'>('form');
  const [forgotPassword, setForgotPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingDoctor, setPendingDoctor] = useState<Doctor | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showEmailDemo, setShowEmailDemo] = useState(false);
  const verificationInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on verification input when on verification step
  useEffect(() => {
    if (registrationStep === 'verification' && verificationInputRef.current) {
      setTimeout(() => {
        verificationInputRef.current?.focus();
      }, 100);
    }
  }, [registrationStep]);

  // Initialize email status check in browser only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('./utils/emailCheck').then(({ initEmailStatusCheck }) => {
        initEmailStatusCheck();
      }).catch(console.warn);
    }
  }, []);

  // Global state for test results and access codes
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([
    {
      id: '1',
      code: 'MED7-4K9P',
      patientName: 'Анна Петрова',
      createdDate: '2024-01-15',
      expiryDate: '2024-01-22',
      isActive: false,
      usedDate: '2024-01-15',
      testResults: 0
    },
    {
      id: '2',
      code: 'DOC2-8H5L',
      patientName: 'Михаил Коротков',
      createdDate: '2024-01-14',
      expiryDate: '2024-01-21',
      isActive: false,
      usedDate: '2024-01-14',
      testResults: 0
    },
    {
      id: '3',
      code: 'PSY9-3N6R',
      patientName: 'Елена Волкова',
      createdDate: '2024-01-16',
      expiryDate: '2024-01-23',
      isActive: true,
      testResults: 0
    }
  ]);

  // Doctor management functions
  const getDoctors = (): Doctor[] => {
    try {
      const stored = localStorage.getItem('doctors');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const saveDoctors = (doctors: Doctor[]) => {
    try {
      localStorage.setItem('doctors', JSON.stringify(doctors));
    } catch (error) {
      console.error('Failed to save doctors:', error);
    }
  };

  const validateRegistration = () => {
    const newErrors: Record<string, string> = {};

    // Name validation
    if (!doctorName.trim()) {
      newErrors.name = 'Введите ваше полное имя';
    } else if (doctorName.trim().length < 2) {
      newErrors.name = 'Имя слишком короткое';
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!doctorEmail.trim()) {
      newErrors.email = 'Введите email адрес';
    } else if (!emailRegex.test(doctorEmail)) {
      newErrors.email = 'Введите корректный email адрес';
    } else {
      // Check if email already exists
      const existingDoctors = getDoctors();
      if (existingDoctors.some(doc => doc.email.toLowerCase() === doctorEmail.toLowerCase())) {
        newErrors.email = 'Этот email уже зарегистрирован';
      }
    }

    // Password validation
    if (!doctorPassword) {
      newErrors.password = 'Введите пароль';
    } else if (doctorPassword.length < 6) {
      newErrors.password = 'Пароль должен содержать минимум 6 символов';
    } else if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(doctorPassword)) {
      newErrors.password = 'Пароль должен содержать буквы и цифры';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateLogin = () => {
    const newErrors: Record<string, string> = {};

    if (!doctorEmail.trim()) {
      newErrors.email = 'Введите email адрес';
    }

    if (!doctorPassword) {
      newErrors.password = 'Введите пароль';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Generate 6-digit verification code
  const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  // Send email with verification code and account details
  const sendVerificationEmail = async (doctor: Doctor, isResend = false) => {
    try {
      console.log(`${isResend ? 'Повторная отправка' : 'Отправка'} кода подтверждения на ${doctor.email}`);
      
      // Попытка отправить реальный email
      const result = await emailService.sendVerificationEmail(doctor, isResend);
      
      if (result.success) {
        console.log('✅ Email успешно отправлен');
        if (isResend) {
          setErrors({ success: 'Новый код подтверждения отправлен на вашу почту' });
        }
      } else {
        console.warn('⚠️ Не удалось отправить email, показываем демо:', result.error);
        // Fallback to demo if email service fails
        console.log('Код подтверждения:', doctor.verificationCode);
        console.log('Данные аккаунта:', {
          name: doctor.name,
          email: doctor.email,
          specialty: doctor.specialty || 'Не указана',
          clinic: doctor.clinic || 'Не указана',
          registrationDate: new Date(doctor.registrationDate).toLocaleDateString('ru-RU')
        });
        
        // Показываем демо email при ошибке отправки
        setTimeout(() => {
          setShowEmailDemo(true);
        }, 1000);
      }
    } catch (error) {
      console.error('❌ Критическая ошибка отправки email:', error);
      // Fallback to demo mode
      console.log('Код подтверждения:', doctor.verificationCode);
      setTimeout(() => {
        setShowEmailDemo(true);
      }, 1000);
    }
  };

  const validateVerificationCode = () => {
    const newErrors: Record<string, string> = {};

    if (!verificationCode.trim()) {
      newErrors.code = 'Введите код подтверждения';
    } else if (verificationCode.length !== 6) {
      newErrors.code = 'Код должен содержать 6 цифр';
    } else if (!/^\d+$/.test(verificationCode)) {
      newErrors.code = 'Код должен содержать только цифры';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resendVerificationCode = () => {
    if (!pendingDoctor || resendCooldown > 0) return;

    const newCode = generateVerificationCode();
    const updatedDoctor = {
      ...pendingDoctor,
      verificationCode: newCode,
      verificationExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    };

    setPendingDoctor(updatedDoctor);
    sendVerificationEmail(updatedDoctor, true);
    
    // Set cooldown for resend button
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    setErrors({ success: 'Новый код подтверждения отправлен на вашу почту' });
  };

  // Function to save test results
  const saveTestResult = (result: Omit<TestResult, 'id' | 'date' | 'patientId'>) => {
    const newResult: TestResult = {
      ...result,
      id: 'result_' + Date.now(),
      date: new Date().toISOString().split('T')[0],
      patientId: user?.id || 'unknown',
    };

    setTestResults(prev => [newResult, ...prev]);

    // Update access code usage
    setAccessCodes(prev => prev.map(code => 
      code.code === result.accessCode 
        ? { 
            ...code, 
            isActive: false, 
            usedDate: newResult.date,
            testResults: (code.testResults || 0) + 1
          }
        : code
    ));

    console.log('Test result saved:', newResult);
  };

  const handleStartScreening = async () => {
    if (!patientName.trim() || !accessCode.trim()) {
      return;
    }
    
    setLoading(true);
    // Simulate API call to validate access code
    setTimeout(() => {
      // Check if access code is valid
      const validCode = accessCodes.find(code => code.code === accessCode && code.isActive);
      
      if (!validCode) {
        setLoading(false);
        alert('Неверный или истекший код доступа');
        return;
      }

      // Mock successful patient authentication
      const authenticatedUser: User = {
        role: 'patient',
        name: patientName,
        id: 'patient_' + Date.now()
      };
      setUser(authenticatedUser);
      setAppState('screening');
      setLoading(false);
    }, 800);
  };

  const handleDoctorAccess = () => {
    setAppState('doctor-auth');
  };

  const handleDoctorLogin = async () => {
    setErrors({});
    
    if (isRegistering) {
      // Registration flow
      if (!validateRegistration()) return;
      
      setLoading(true);
      
      // Simulate API call delay
      setTimeout(() => {
        const verificationCode = generateVerificationCode();
        const newDoctor: Doctor = {
          id: 'doc_' + Date.now(),
          email: doctorEmail.toLowerCase(),
          name: doctorName,
          password: doctorPassword, // В реальной системе пароль должен быть захеширован
          specialty: doctorSpecialty,
          clinic: doctorClinic,
          registrationDate: new Date().toISOString(),
          isVerified: false,
          verificationCode,
          verificationExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 минут
        };

        setPendingDoctor(newDoctor);
        sendVerificationEmail(newDoctor);
        setRegistrationStep('verification');
        setLoading(false);
      }, 1500);
    } else {
      // Login flow
      if (!validateLogin()) return;
      
      setLoading(true);
      
      setTimeout(() => {
        const doctors = getDoctors();
        const doctor = doctors.find(doc => 
          doc.email.toLowerCase() === doctorEmail.toLowerCase() && 
          doc.password === doctorPassword
        );

        if (doctor) {
          if (!doctor.isVerified) {
            setErrors({ login: 'Аккаунт не подтвержден. Проверьте почту для подтверждения.' });
            setLoading(false);
            return;
          }

          const authenticatedUser: User = {
            role: 'doctor',
            name: doctor.name,
            id: doctor.id
          };
          setUser(authenticatedUser);
          setAppState('doctor');
        } else {
          setErrors({ login: 'Неверный email или пароль' });
        }
        setLoading(false);
      }, 1000);
    }
  };

  const handleVerifyCode = () => {
    if (!validateVerificationCode() || !pendingDoctor) return;

    setLoading(true);

    setTimeout(() => {
      // Check if code is correct and not expired
      const now = new Date();
      const expiry = new Date(pendingDoctor.verificationExpiry || 0);

      if (now > expiry) {
        setErrors({ code: 'Код подтверждения истек. Запросите новый код.' });
        setLoading(false);
        return;
      }

      if (verificationCode !== pendingDoctor.verificationCode) {
        setErrors({ code: 'Неверный код подтверждения' });
        setLoading(false);
        return;
      }

      // Code is correct - save doctor and mark as verified
      const verifiedDoctor: Doctor = {
        ...pendingDoctor,
        isVerified: true,
        verificationCode: undefined,
        verificationExpiry: undefined
      };

      const doctors = getDoctors();
      doctors.push(verifiedDoctor);
      saveDoctors(doctors);

      setRegistrationStep('success');
      setLoading(false);
    }, 1000);
  };

  const handleForgotPassword = () => {
    setForgotPassword(true);
    setErrors({});
    
    if (!doctorEmail.trim()) {
      setErrors({ email: 'Введите email для восстановления пароля' });
      return;
    }

    const doctors = getDoctors();
    const doctor = doctors.find(doc => doc.email.toLowerCase() === doctorEmail.toLowerCase());
    
    if (doctor) {
      // Simulate sending email
      setTimeout(() => {
        setErrors({ success: 'Инструкции по восстановлению пароля отправлены на email' });
      }, 1000);
    } else {
      setErrors({ email: 'Пользователь с таким email не найден' });
    }
  };

  const completeRegistration = () => {
    setRegistrationStep('form');
    setIsRegistering(false);
    setDoctorEmail('');
    setDoctorPassword('');
    setDoctorName('');
    setDoctorSpecialty('');
    setDoctorClinic('');
    setVerificationCode('');
    setPendingDoctor(null);
    setResendCooldown(0);
    setShowEmailDemo(false);
    setErrors({});
  };

  const handleBackToHome = () => {
    setAppState('home');
    // Reset doctor auth states
    setDoctorEmail('');
    setDoctorPassword('');
    setDoctorName('');
    setDoctorSpecialty('');
    setDoctorClinic('');
    setIsRegistering(false);
    setShowPassword(false);
    setErrors({});
    setRegistrationStep('form');
    setForgotPassword(false);
    setVerificationCode('');
    setPendingDoctor(null);
    setResendCooldown(0);
  };

  const handleLogout = () => {
    setUser(null);
    setPatientName('');
    setAccessCode('');
    setAppState('home');
  };

  if (appState === 'doctor-auth') {
    // Email verification screen
    if (registrationStep === 'verification') {
      return (
        <div className="min-h-screen relative" style={{ background: 'linear-gradient(135deg, #F0F4FF 0%, #FAFAFA 100%)' }}>
          <div className="relative z-10 flex items-center justify-center min-h-screen px-6 py-16">
            <div className="w-full max-w-md">
              {/* Header */}
              <div className="flex items-center space-x-4 mb-8">
                <button
                  onClick={() => {
                    setRegistrationStep('form');
                    setPendingDoctor(null);
                    setVerificationCode('');
                    setErrors({});
                  }}
                  className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" style={{ color: '#6B7280' }} />
                </button>
                <div>
                  <h2 
                    className="text-2xl leading-tight"
                    style={{ 
                      fontWeight: '600',
                      color: '#1F2937',
                      letterSpacing: '-0.02em'
                    }}
                  >
                    Подтверждение email
                  </h2>
                  <p style={{ color: '#6B7280', fontWeight: '400' }}>
                    Введите код, отправленный на вашу почту
                  </p>
                </div>
              </div>

              {/* Error/Success messages */}
              {errors.code && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl">
                  <p className="text-sm text-red-800">{errors.code}</p>
                </div>
              )}
              {errors.success && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl">
                  <p className="text-sm text-green-800">{errors.success}</p>
                </div>
              )}

              {/* Main verification card */}
              <div 
                className="rounded-3xl p-8 backdrop-blur-sm border border-white/60 shadow-lg"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.85)' }}
              >
                <div className="text-center space-y-6">
                  {/* Email icon */}
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                    <Mail className="h-8 w-8 text-blue-600" />
                  </div>

                  {/* Email info */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Код отправлен на почту
                    </h3>
                    <p className="text-gray-600 mb-1">
                      {pendingDoctor?.email}
                    </p>
                    <p className="text-sm text-gray-500">
                      Проверьте папку "Спам", если не видите письмо
                    </p>
                  </div>

                  {/* Verification code input */}
                  <div className="space-y-3">
                    <label 
                      className="block text-sm"
                      style={{ 
                        color: '#374151', 
                        fontWeight: '500',
                        letterSpacing: '-0.005em'
                      }}
                    >
                      Код подтверждения
                    </label>
                    <Input
                      ref={verificationInputRef}
                      type="text"
                      value={verificationCode}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setVerificationCode(value);
                        if (errors.code) setErrors(prev => ({ ...prev, code: '' }));
                      }}
                      placeholder="123456"
                      className={`w-full px-4 py-4 text-base rounded-2xl border transition-all duration-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-center text-2xl font-mono tracking-widest ${
                        errors.code ? 'border-red-300 bg-red-50' : 'border-gray-200/80'
                      }`}
                      maxLength={6}
                    />
                    <p className="text-xs text-gray-500 text-center">
                      Введите 6-значный код из письма
                    </p>
                  </div>

                  {/* Verify button */}
                  <Button
                    onClick={handleVerifyCode}
                    disabled={loading || verificationCode.length !== 6}
                    className="w-full py-4 px-6 text-base rounded-2xl transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50"
                    style={{
                      backgroundColor: '#2563EB',
                      fontWeight: '600',
                      letterSpacing: '-0.01em'
                    }}
                  >
                    {loading ? (
                      <div className="flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                        Проверка кода...
                      </div>
                    ) : (
                      'Подтвердить'
                    )}
                  </Button>

                  {/* Resend code and email preview */}
                  <div className="text-center space-y-3">
                    <p className="text-sm text-gray-600">
                      Не получили код?
                    </p>
                    <div className="flex flex-col space-y-2">
                      <button
                        onClick={resendVerificationCode}
                        disabled={resendCooldown > 0 || !pendingDoctor}
                        className="inline-flex items-center justify-center text-sm transition-colors duration-200 disabled:opacity-50"
                        style={{ color: resendCooldown > 0 ? '#9CA3AF' : '#2563EB' }}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        {resendCooldown > 0 
                          ? `Повторить через ${resendCooldown}с` 
                          : 'Отправить повторно'
                        }
                      </button>
                      <button
                        onClick={() => setShowEmailDemo(true)}
                        className="inline-flex items-center justify-center text-sm transition-colors duration-200 text-gray-600 hover:text-blue-600"
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        Посмотреть отправленное письмо
                      </button>
                    </div>
                  </div>

                  {/* Code expiry info */}
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                    <div className="flex items-start space-x-3">
                      <Clock className="h-5 w-5 mt-0.5" style={{ color: '#F59E0B' }} />
                      <div>
                        <p className="text-sm" style={{ color: '#92400E', fontWeight: '500' }}>
                          Код действует 10 минут
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#A16207' }}>
                          После истечения времени запросите новый код
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security indicator */}
              <div className="flex items-center justify-center mt-8">
                <Shield className="h-4 w-4 mr-2" style={{ color: '#9CA3AF' }} />
                <span className="text-sm" style={{ color: '#9CA3AF' }}>
                  Защищенное подтверждение личности
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Registration success screen
    if (registrationStep === 'success') {
      return (
        <div className="min-h-screen relative" style={{ background: 'linear-gradient(135deg, #F0F4FF 0%, #FAFAFA 100%)' }}>
          <div className="relative z-10 flex items-center justify-center min-h-screen px-6 py-16">
            <div className="w-full max-w-md text-center">
              <div 
                className="rounded-3xl p-8 backdrop-blur-sm border border-white/60 shadow-lg"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.85)' }}
              >
                <div className="text-center space-y-6">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <UserCheck className="h-8 w-8 text-green-600" />
                  </div>
                  
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                      Email подтвержден!
                    </h2>
                    <p className="text-gray-600">
                      Регистрация успешно завершена
                    </p>
                  </div>

                  {/* Account details */}
                  {pendingDoctor && (
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-left">
                      <h4 className="text-sm font-semibold text-blue-900 mb-3">
                        📋 Данные вашего аккаунта:
                      </h4>
                      <div className="space-y-2 text-sm text-blue-800">
                        <div><strong>Имя:</strong> {pendingDoctor.name}</div>
                        <div><strong>Email:</strong> {pendingDoctor.email}</div>
                        {pendingDoctor.specialty && (
                          <div><strong>Специальность:</strong> {pendingDoctor.specialty}</div>
                        )}
                        {pendingDoctor.clinic && (
                          <div><strong>Место работы:</strong> {pendingDoctor.clinic}</div>
                        )}
                        <div><strong>Дата регистрации:</strong> {new Date(pendingDoctor.registrationDate).toLocaleDateString('ru-RU')}</div>
                      </div>
                    </div>
                  )}

                  <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                    <p className="text-sm text-green-800">
                      ✅ Аккаунт подтвержден и готов к использованию<br/>
                      🚀 Теперь вы можете создавать коды доступа для пациентов<br/>
                      📊 Получать результаты тестов с ИИ-анализом<br/>
                      📱 Отправлять результаты в WhatsApp/Telegram
                    </p>
                  </div>

                  <Button
                    onClick={completeRegistration}
                    className="w-full py-4 px-6 text-base rounded-2xl"
                    style={{ backgroundColor: '#2563EB' }}
                  >
                    Перейти к входу
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen relative" style={{ background: 'linear-gradient(135deg, #F0F4FF 0%, #FAFAFA 100%)' }}>
        {/* Background decorations */}
        <div className="absolute top-20 left-10 w-32 h-32 opacity-10">
          <svg viewBox="0 0 200 200" className="w-full h-full">
            <path
              d="M20,100 Q50,20 100,50 Q150,80 180,100 Q150,180 100,150 Q50,120 20,100 Z"
              fill="#E5E7EB"
            />
          </svg>
        </div>

        <div className="absolute bottom-0 left-0 w-full overflow-hidden">
          <svg 
            viewBox="0 0 1200 200" 
            className="w-full h-32 sm:h-40"
            preserveAspectRatio="none"
          >
            <path 
              d="M0,100 C300,150 400,50 600,80 C800,110 900,60 1200,90 L1200,200 L0,200 Z" 
              fill="rgba(239, 246, 255, 0.4)"
            />
          </svg>
        </div>

        {/* Main content */}
        <div className="relative z-10 flex items-center justify-center min-h-screen px-6 py-16">
          <div className="w-full max-w-md">
            {/* Header */}
            <div className="flex items-center space-x-4 mb-8">
              <button
                onClick={handleBackToHome}
                className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" style={{ color: '#6B7280' }} />
              </button>
              <div>
                <h2 
                  className="text-2xl leading-tight"
                  style={{ 
                    fontWeight: '600',
                    color: '#1F2937',
                    letterSpacing: '-0.02em'
                  }}
                >
                  {isRegistering ? 'Регистрация врача' : 'Вход для врачей'}
                </h2>
                <p style={{ color: '#6B7280', fontWeight: '400' }}>
                  {isRegistering ? 'Создание аккаунта для доступа к системе' : 'Доступ к панели управления и результатам'}
                </p>
              </div>
            </div>

            {/* Error/Success messages */}
            {errors.login && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl">
                <p className="text-sm text-red-800">{errors.login}</p>
              </div>
            )}
            {errors.success && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl">
                <p className="text-sm text-green-800">{errors.success}</p>
              </div>
            )}

            {/* Main form card */}
            <div 
              className="rounded-3xl p-8 backdrop-blur-sm border border-white/60 shadow-lg"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.85)' }}
            >
              <div className="space-y-6">
                {/* Name field for registration */}
                {isRegistering && (
                  <div className="space-y-3">
                    <label 
                      className="block text-sm"
                      style={{ 
                        color: '#374151', 
                        fontWeight: '500',
                        letterSpacing: '-0.005em'
                      }}
                    >
                      Полное имя *
                    </label>
                    <Input
                      type="text"
                      value={doctorName}
                      onChange={(e) => {
                        setDoctorName(e.target.value);
                        if (errors.name) setErrors(prev => ({ ...prev, name: '' }));
                      }}
                      placeholder="Иванов Иван Иванович"
                      className={`w-full px-4 py-4 text-base rounded-2xl border transition-all duration-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                        errors.name ? 'border-red-300 bg-red-50' : 'border-gray-200/80'
                      }`}
                    />
                    {errors.name && (
                      <p className="text-sm text-red-600">{errors.name}</p>
                    )}
                  </div>
                )}

                {/* Specialty field for registration */}
                {isRegistering && (
                  <div className="space-y-3">
                    <label 
                      className="block text-sm"
                      style={{ 
                        color: '#374151', 
                        fontWeight: '500',
                        letterSpacing: '-0.005em'
                      }}
                    >
                      Специальность (необязательно)
                    </label>
                    <Input
                      type="text"
                      value={doctorSpecialty}
                      onChange={(e) => setDoctorSpecialty(e.target.value)}
                      placeholder="Врач-психиатр, Психотерапевт..."
                      className="w-full px-4 py-4 text-base rounded-2xl border border-gray-200/80 transition-all duration-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                )}

                {/* Clinic field for registration */}
                {isRegistering && (
                  <div className="space-y-3">
                    <label 
                      className="block text-sm"
                      style={{ 
                        color: '#374151', 
                        fontWeight: '500',
                        letterSpacing: '-0.005em'
                      }}
                    >
                      Место работы (необязательно)
                    </label>
                    <Input
                      type="text"
                      value={doctorClinic}
                      onChange={(e) => setDoctorClinic(e.target.value)}
                      placeholder="Клиника, больница, частная практика..."
                      className="w-full px-4 py-4 text-base rounded-2xl border border-gray-200/80 transition-all duration-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                )}

                {/* Email field */}
                <div className="space-y-3">
                  <label 
                    className="block text-sm"
                    style={{ 
                      color: '#374151', 
                      fontWeight: '500',
                      letterSpacing: '-0.005em'
                    }}
                  >
                    Email *
                  </label>
                  <Input
                    type="email"
                    value={doctorEmail}
                    onChange={(e) => {
                      setDoctorEmail(e.target.value);
                      if (errors.email) setErrors(prev => ({ ...prev, email: '' }));
                    }}
                    placeholder="doctor@clinic.com"
                    className={`w-full px-4 py-4 text-base rounded-2xl border transition-all duration-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                      errors.email ? 'border-red-300 bg-red-50' : 'border-gray-200/80'
                    }`}
                  />
                  {errors.email && (
                    <p className="text-sm text-red-600">{errors.email}</p>
                  )}
                </div>

                {/* Password field */}
                <div className="space-y-3">
                  <label 
                    className="block text-sm"
                    style={{ 
                      color: '#374151', 
                      fontWeight: '500',
                      letterSpacing: '-0.005em'
                    }}
                  >
                    Пароль *
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={doctorPassword}
                      onChange={(e) => {
                        setDoctorPassword(e.target.value);
                        if (errors.password) setErrors(prev => ({ ...prev, password: '' }));
                      }}
                      placeholder="••••••••"
                      className={`w-full px-4 py-4 pr-12 text-base rounded-2xl border transition-all duration-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                        errors.password ? 'border-red-300 bg-red-50' : 'border-gray-200/80'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1 rounded hover:bg-gray-100 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" style={{ color: '#6B7280' }} />
                      ) : (
                        <Eye className="h-4 w-4" style={{ color: '#6B7280' }} />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-red-600">{errors.password}</p>
                  )}
                  {isRegistering && (
                    <p className="text-xs text-gray-500">
                      Минимум 6 символов, должен содержать буквы и цифры
                    </p>
                  )}
                </div>

                {/* Submit button */}
                <Button
                  onClick={handleDoctorLogin}
                  disabled={loading}
                  className="w-full py-4 px-6 text-base rounded-2xl transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50"
                  style={{
                    backgroundColor: '#2563EB',
                    fontWeight: '600',
                    letterSpacing: '-0.01em'
                  }}
                >
                  {loading ? (
                    <div className="flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      {isRegistering ? 'Создание аккаунта...' : 'Проверка...'}
                    </div>
                  ) : (
                    isRegistering ? 'Зарегистрироваться' : 'Войти'
                  )}
                </Button>

                {/* Toggle registration/login */}
                <div className="text-center space-y-2">
                  <button
                    onClick={() => {
                      setIsRegistering(!isRegistering);
                      setErrors({});
                      setForgotPassword(false);
                    }}
                    className="text-sm transition-colors duration-200"
                    style={{ color: '#6B7280' }}
                  >
                    {isRegistering ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
                  </button>
                  
                  {!isRegistering && !forgotPassword && (
                    <div>
                      <button
                        onClick={handleForgotPassword}
                        className="text-sm transition-colors duration-200"
                        style={{ color: '#6B7280' }}
                      >
                        Забыли пароль?
                      </button>
                    </div>
                  )}
                </div>

                {/* Registration benefits */}
                {isRegistering && (
                  <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
                    <div className="flex items-start space-x-3">
                      <Shield className="h-5 w-5 mt-0.5" style={{ color: '#3B82F6' }} />
                      <div>
                        <p className="text-sm" style={{ color: '#1E40AF', fontWeight: '500' }}>
                          Возможности системы
                        </p>
                        <ul className="text-xs mt-1 space-y-1" style={{ color: '#6B7280' }}>
                          <li>• Создание кодов доступа для пациентов</li>
                          <li>• Получение результатов с ИИ-анализом</li>
                          <li>• Отправка результатов в WhatsApp/Telegram</li>
                          <li>• Безопасное хранение медицинских данных</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Security indicator */}
            <div className="flex items-center justify-center mt-8">
              <Shield className="h-4 w-4 mr-2" style={{ color: '#9CA3AF' }} />
              <span className="text-sm" style={{ color: '#9CA3AF' }}>
                Медицинские данные под защитой
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'screening') {
    return (
      <SmartPatientInterface 
        onBack={handleBackToHome}
        user={user}
        onLogout={handleLogout}
        accessCode={accessCode}
        onSaveTestResult={saveTestResult}
      />
    );
  }

  if (appState === 'doctor') {
    return (
      <DoctorDashboard 
        onBack={handleBackToHome}
        user={user}
        onLogout={handleLogout}
        testResults={testResults}
        accessCodes={accessCodes}
        setAccessCodes={setAccessCodes}
      />
    );
  }

  return (
    <div className="min-h-screen relative" style={{ background: 'linear-gradient(135deg, #F0F4FF 0%, #FAFAFA 100%)' }}>
      {/* Subtle abstract decorations */}
      <div className="absolute top-20 left-10 w-32 h-32 opacity-10">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <path
            d="M20,100 Q50,20 100,50 Q150,80 180,100 Q150,180 100,150 Q50,120 20,100 Z"
            fill="#E5E7EB"
          />
        </svg>
      </div>
      
      <div className="absolute top-40 right-16 w-24 h-24 opacity-8">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <circle cx="100" cy="100" r="80" fill="none" stroke="#D1D5DB" strokeWidth="2" opacity="0.3"/>
          <circle cx="100" cy="100" r="50" fill="none" stroke="#D1D5DB" strokeWidth="1.5" opacity="0.2"/>
        </svg>
      </div>

      {/* Soft wave decoration at bottom */}
      <div className="absolute bottom-0 left-0 w-full overflow-hidden">
        <svg 
          viewBox="0 0 1200 200" 
          className="w-full h-32 sm:h-40"
          preserveAspectRatio="none"
        >
          <path 
            d="M0,100 C300,150 400,50 600,80 C800,110 900,60 1200,90 L1200,200 L0,200 Z" 
            fill="rgba(239, 246, 255, 0.4)"
          />
        </svg>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex items-center justify-center min-h-screen px-6 py-16">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 
              className="text-3xl sm:text-4xl leading-tight mb-6"
              style={{ 
                fontWeight: '600',
                color: '#1F2937',
                letterSpacing: '-0.025em'
              }}
            >
              Оцените своё психическое состояние
            </h1>
            <p 
              className="text-lg leading-relaxed"
              style={{ 
                color: '#6B7280',
                fontWeight: '400',
                letterSpacing: '-0.01em'
              }}
            >
              Пройдите короткий опрос — ваши ответы помогут врачу лучше вас понять
            </p>
          </div>

          {/* Main form card */}
          <div 
            className="rounded-3xl p-8 backdrop-blur-sm border border-white/60 shadow-lg"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.85)' }}
          >
            <div className="space-y-8">
              {/* Name input */}
              <div className="space-y-3">
                <label 
                  htmlFor="patient-name" 
                  className="block text-sm"
                  style={{ 
                    color: '#374151', 
                    fontWeight: '500',
                    letterSpacing: '-0.005em'
                  }}
                >
                  Ваше имя
                </label>
                <Input
                  id="patient-name"
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Введите ваше имя"
                  className="w-full px-4 py-4 text-base rounded-2xl border border-gray-200/80 transition-all duration-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)' }}
                />
              </div>

              {/* Access code input */}
              <div className="space-y-3">
                <label 
                  htmlFor="access-code" 
                  className="block text-sm"
                  style={{ 
                    color: '#374151', 
                    fontWeight: '500',
                    letterSpacing: '-0.005em'
                  }}
                >
                  Код доступа от врача
                </label>
                <Input
                  id="access-code"
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                  placeholder="ABCD-1234"
                  className="w-full px-4 py-4 text-base rounded-2xl border border-gray-200/80 transition-all duration-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono tracking-wider"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)' }}
                />
              </div>

              {/* Start button */}
              <Button
                onClick={handleStartScreening}
                disabled={loading || !patientName.trim() || !accessCode.trim()}
                className="w-full py-4 px-6 text-base rounded-2xl transition-all duration-300 shadow-md hover:shadow-lg focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                style={{
                  backgroundColor: '#2563EB',
                  fontWeight: '600',
                  letterSpacing: '-0.01em'
                }}
                onMouseEnter={(e) => {
                  if (!loading && patientName.trim() && accessCode.trim()) {
                    e.currentTarget.style.backgroundColor = '#1D4ED8';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563EB';
                }}
              >
                <UserCheck className="h-4 w-4 mr-2" />
                {loading ? 'Проверка доступа...' : 'Начать скрининг'}
              </Button>

              {/* Info about access code */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
                <div className="flex items-start space-x-3">
                  <Shield className="h-5 w-5 mt-0.5" style={{ color: '#3B82F6' }} />
                  <div>
                    <p className="text-sm" style={{ color: '#1E40AF', fontWeight: '500' }}>
                      Безопасный доступ
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#6B7280' }}>
                      Код доступа обеспечивает конфиденциальность и связывает ваши результаты с вашим врачом
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Security indicator */}
          <div className="flex items-center justify-center mt-8">
            <Shield className="h-4 w-4 mr-2" style={{ color: '#9CA3AF' }} />
            <span className="text-sm" style={{ color: '#9CA3AF' }}>
              Ваши данные защищены
            </span>
          </div>

          {/* Additional info */}
          <div className="text-center mt-12 space-y-3">
            <p className="text-xs" style={{ color: '#D1D5DB' }}>
              Конфиденциальный скрининг • 5-10 минут
            </p>
            <p className="text-xs" style={{ color: '#D1D5DB' }}>
              Результаты будут переданы только вашему врачу
            </p>
          </div>

          {/* User status and access */}
          {user ? (
            <div className="text-center mt-8 space-y-4">
              <div className="flex items-center justify-center space-x-2 text-sm" style={{ color: '#059669' }}>
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Авторизован как {user.role === 'doctor' ? 'врач' : 'пациент'}: {user.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center text-xs transition-colors duration-200 opacity-60 hover:opacity-80"
                style={{ color: '#9CA3AF' }}
              >
                <LogOut className="h-3 w-3 mr-1" />
                Выйти
              </button>
            </div>
          ) : (
            <div className="text-center mt-8">
              <button
                onClick={handleDoctorAccess}
                className="inline-flex items-center text-xs transition-colors duration-200 opacity-50 hover:opacity-70"
                style={{ color: '#9CA3AF' }}
              >
                <Stethoscope className="h-3 w-3 mr-1" />
                Для врачей
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Email Demo Modal */}
      {pendingDoctor && (
        <EmailNotificationDemo 
          doctor={pendingDoctor}
          isVisible={showEmailDemo}
          onClose={() => setShowEmailDemo(false)}
        />
      )}
    </div>
  );
}