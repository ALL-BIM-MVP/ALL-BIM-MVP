import React, { useState, useRef } from 'react';
import { Camera, Trash2, Loader2, AlertCircle, Save, ShieldAlert, X as XIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { updateMyProfile, uploadMyPhoto, deleteMyPhoto, deleteMyAccount } from '../services/users.service';
import AvatarCropper from './auth/AvatarCropper';

interface MiPerfilModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVATAR_PALETTE = ["#0056b3", "#7c3aed", "#0d9488", "#c2410c", "#be185d", "#4338ca"];
function avatarColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

const MiPerfilModal: React.FC<MiPerfilModalProps> = ({ isOpen, onClose }) => {
  const { user, updateUser, logout } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Solo el File elegido — el recorte (arrastrar/zoom) vive adentro de
  // AvatarCropper, esto acá ni sabe que existe hasta que se confirma.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState(false);

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const nameChanged = name !== user.name || lastName !== (user.last_name ?? '');

  const handleClose = () => {
    if (savingProfile || uploadingPhoto || deletingPhoto || deletingAccount) return;
    onClose();
  };

  const handleSaveProfile = async () => {
    if (!nameChanged || !name.trim()) return;
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      const updated = await updateMyProfile({
        name: name.trim(),
        last_name: lastName.trim() || undefined,
      });
      updateUser({ name: updated.name, last_name: updated.last_name });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err: any) {
      setProfileError(err.message || 'No se pudo guardar los cambios.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendingFile(file);
    setPhotoError(null);
  };

  const cancelPendingPhoto = () => {
    setPendingFile(null);
    setPhotoError(null);
  };

  // Recibe el archivo YA recortado (cuadrado, según lo que el usuario
  // eligió en AvatarCropper) — no el original que se seleccionó.
  const confirmUploadPhoto = async (croppedFile: File) => {
    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const result = await uploadMyPhoto(croppedFile);
      updateUser({ profile_picture_url: result.profile_picture_url });
      setPendingFile(null);
    } catch (err: any) {
      setPhotoError(err.message || 'No se pudo subir la foto.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async () => {
    setDeletingPhoto(true);
    setPhotoError(null);
    try {
      await deleteMyPhoto();
      updateUser({ profile_picture_url: null });
    } catch (err: any) {
      setPhotoError(err.message || 'No se pudo borrar la foto.');
    } finally {
      setDeletingPhoto(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) return;
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      await deleteMyAccount();
      logout();
    } catch (err: any) {
      setDeleteError(err.message || 'No se pudo eliminar la cuenta.');
      setDeletingAccount(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200] p-6"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800">Mi perfil</h2>
            <p className="text-xs text-gray-400">Editá tus datos y tu foto de perfil</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
            title="Cerrar"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-3">Foto de perfil</h3>
            <div className="flex items-center gap-5">
              {user.profile_picture_url ? (
                <img
                  src={user.profile_picture_url}
                  alt={user.name}
                  className="w-20 h-20 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <span
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
                  style={{ backgroundColor: avatarColorFor(user.email || user.name) }}
                >
                  {(user.name || user.email || '?').charAt(0).toUpperCase()}
                </span>
              )}

              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelected}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Camera size={15} />
                  {user.profile_picture_url ? 'Cambiar foto' : 'Subir foto'}
                </button>
                {user.profile_picture_url && (
                  <button
                    onClick={handleDeletePhoto}
                    disabled={deletingPhoto}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {deletingPhoto ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    Quitar foto
                  </button>
                )}
              </div>
            </div>
            {photoError && (
              <p className="text-xs text-red-600 mt-3">{photoError}</p>
            )}
          </div>

          <div className="border-t border-gray-100 pt-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3">Datos personales</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0056b3] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Apellido</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0056b3] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Correo</label>
                <input
                  type="text"
                  value={user.email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400"
                />
              </div>
            </div>

            {profileError && (
              <p className="text-xs text-red-600 mt-3">{profileError}</p>
            )}

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleSaveProfile}
                disabled={!nameChanged || !name.trim() || savingProfile}
                className="flex items-center gap-2 px-4 py-2 bg-[#0056b3] text-white rounded-lg text-sm font-semibold hover:bg-[#004494] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingProfile ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Guardar cambios
              </button>
              {profileSaved && (
                <span className="text-xs text-emerald-600 font-medium">Guardado</span>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5">
            <h3 className="text-sm font-bold text-red-700 mb-1 flex items-center gap-2">
              <ShieldAlert size={16} />
              Eliminar mi cuenta
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Esta acción es permanente y no se puede deshacer.
            </p>
                       <button
              onClick={() => setShowDeleteAccount(true)}
              className="px-3.5 py-2 rounded-lg border border-red-300 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Eliminar mi cuenta
            </button>
          </div>
        </div>
      </div>

      {pendingFile && (
        <AvatarCropper
          file={pendingFile}
          uploading={uploadingPhoto}
          error={photoError}
          onCancel={cancelPendingPhoto}
          onConfirm={confirmUploadPhoto}
        />
      )}

      {showDeleteAccount && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[210] p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={18} className="text-red-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Eliminar cuenta</p>
                <p className="text-xs text-gray-500 mt-0.5">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 mb-3">
                Escribí tu correo (<span className="font-semibold">{user.email}</span>) para confirmar.
              </p>
              <input
                type="text"
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                placeholder={user.email}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none"
                autoFocus
              />
              {deleteError && <p className="text-xs text-red-600 mt-2">{deleteError}</p>}
            </div>
            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/70 flex justify-end gap-2">
              <button
                onClick={() => { setShowDeleteAccount(false); setDeleteConfirmEmail(''); setDeleteError(null); }}
                disabled={deletingAccount}
                className="px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmEmail.trim().toLowerCase() !== user.email.toLowerCase() || deletingAccount}
                className="flex items-center gap-2 px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deletingAccount && <Loader2 size={14} className="animate-spin" />}
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiPerfilModal;