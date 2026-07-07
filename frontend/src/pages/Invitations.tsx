// src/pages/Invitations.tsx
import React, { useState } from 'react';
import { createInvitation } from '../services/auth.service';
import Sidebar from '../components/Sidebar';
import { INVITATION_ROLES } from '../utils/roles';

const Invitations: React.FC = () => {
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState('EDITOR');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await createInvitation({ email, rol });
      alert(` ${result.message}`);
      setEmail('');
    } catch (error: any) {
      alert(error.message || 'Error al enviar invitación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Invitar Usuario</h1>
          <p className="text-gray-600 text-sm">Envía invitaciones a nuevos usuarios</p>
        </header>
        <main className="p-8">
          <div className="bg-white p-8 rounded-lg shadow max-w-7xl">
            <form onSubmit={handleSubmit}>

  <div className="grid grid-cols-2 gap-6 mb-6">
    <div>
      <label className="block text-gray-700 font-medium mb-2">
        Correo electrónico del invitado
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:border-[#0056b3]"
        placeholder="ejemplo@correo.com"
        required
      />
    </div>

    <div>
      <label className="block text-gray-700 font-medium mb-2">
       selecciona el rol del usuario
      </label>
      <select
        value={rol}
        onChange={(e) => setRol(e.target.value)}
        className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:border-[#0056b3]"
      >
        {INVITATION_ROLES.map((role) => (
          <option key={role.id} value={role.name}>
            {role.name}
          </option>
        ))}
      </select>
    </div>
  </div>


  <div className="flex justify-end">
    <button
      type="submit"
      disabled={loading}
      className="w-80 bg-[#0056b3] text-white py-3 rounded-lg hover:bg-[#004494] transition-colors disabled:opacity-50 font-semibold"
    >
      {loading ? 'Enviando...' : '✈ Enviar invitación'}
    </button>
  </div>
</form>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Invitations;