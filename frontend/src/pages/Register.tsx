// frontend/src/pages/Register.tsx
import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import RegisterInvitedForm from '../components/RegisterInvitedForm';
import fondo from '../assets/fondo.png';

export default function Register() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const { validateToken, loading } = useAuth();

  const [invitationData, setInvitationData] = useState<{ 
    email: string; 
    role_id: number; 
    role_name: string;
  } | null>(null);
  const [validating, setValidating] = useState(true);
  const hasValidated = useRef(false);

  useEffect(() => {
    if (hasValidated.current) return;
    
    if (!token) {
      console.log('[Register] No hay token en la URL');
      alert('No se encontró invitación válida');
      navigate('/login', { replace: true });
      hasValidated.current = true;
      setValidating(false);
      return;
    }

    setValidating(true);
    hasValidated.current = true;
    
    validateToken(token)
      .then((data) => {
        
        if (data?.email) {
          setInvitationData({
            email: data.email,
            role_id: data.role_id || 0,
            role_name: data.role_name || ''
          });
        } else {
          alert('Invitación inválida o expirada');
          navigate('/login', { replace: true });
        }
        setValidating(false);
      })
      .catch((error) => {
        alert('Invitación inválida o expirada');
        navigate('/login', { replace: true });
        setValidating(false);
      });
  }, [token, validateToken, navigate]);

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0056b3] mx-auto"></div>
          <p className="mt-4 text-gray-600">Validando invitación...</p>
        </div>
      </div>
    );
  }

  if (!invitationData) {
    return null;
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-end pr-[150px] p-4 font-sans"
      style={{
        backgroundImage: `url(${fondo})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}>
      <div className="relative z-10 w-full max-w-[440px] bg-white border border-gray-200 shadow-xl p-10 flex flex-col rounded-xl">
        <div className="mb-5 text-center">
          <span className="font-sans font-black tracking-tighter text-[41px] text-[#0056b3]">ALL-BIM</span>
        </div>
        <RegisterInvitedForm invitationData={invitationData} token={token!} />
      </div>
    </div>
  );
}