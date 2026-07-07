// frontend/src/pages/Login.tsx
import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoginForm from '../components/LoginForm';
import RegisterInvitedForm from '../components/RegisterInvitedForm';
import fondo from '../assets/fondo.png';
export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const { validateToken, loading } = useAuth();

  const [isInvited, setIsInvited] = useState(false);
  const [invitationData, setInvitationData] = useState<{ email: string; valid: boolean } | null>(null);
  const [validating, setValidating] = useState(true);
  
  const hasValidated = useRef(false);

  useEffect(() => {
    if (hasValidated.current) return;
    
    if (!token) {
      console.log('🔍 [Login] No hay token en la URL');
      setValidating(false);
      setIsInvited(false);
      hasValidated.current = true;
      return;
    }

    console.log('🔍 [Login] Token encontrado:', token);
    setValidating(true);
    hasValidated.current = true;
    
    validateToken(token)
      .then((data) => {
        console.log(' [Login] Datos recibidos:', data);
        
        if (data && data.valid === true && data.email) {
          console.log(' [Login] Token válido, mostrando formulario');
          setInvitationData({ email: data.email, valid: true });
          setIsInvited(true);
        } else {
          console.log(' [Login] Token inválido o expirado');
          alert('Invitación inválida o expirada');
          navigate('/login', { replace: true });
        }
        setValidating(false);
      })
      .catch((error) => {
        console.error(' [Login] Error en validación:', error);
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

  console.log(' [Login] Renderizando - isInvited:', isInvited);

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

        {isInvited ? (
          <RegisterInvitedForm invitationData={invitationData!} token={token!} />
        ) : (
          <LoginForm />
        )}
      </div>
    </div>
  );
}