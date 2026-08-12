import { useState, useEffect, useCallback } from 'react';
import {
    getProjectInvitations,
    searchUsersToInvite,
    createProjectInvitation,
    updateInvitationStatus,
    getProjectMembers,
    getCurrentUserProjectRole,
    
} from '../services/invitation.service';
import {
    Invitation,
    UserSearchResult,
    ProjectMember,
} from '../types/invitation.types';
import { useAuth } from '../context/AuthContext';

export const useProjectInvitations = (projectId: number) => {
    const { user } = useAuth();
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOwner, setIsOwner] = useState(false);
    const [userRole, setUserRole] = useState<{ role_id: number; role_name: string } | null>(null);
    const [checkingOwner, setCheckingOwner] = useState(true);
    // Cargar invitaciones
    const loadInvitations = useCallback(async () => {
        if (!projectId) 
            return;
        setLoading(true);
        setError(null);
        try {
            const data = await getProjectInvitations(projectId);
            setInvitations(data);
        } catch (err: any) {
            setError(err.message || 'Error al cargar invitaciones');
            console.error('Error loading invitations:', err);
        } finally {
            setLoading(false);
        }
    }, [projectId]);
    
    const checkOwnerStatus = useCallback(async () => {
    if (!projectId || !user) return;
    setCheckingOwner(true);
    try {
        const data = await getCurrentUserProjectRole(projectId);
        setIsOwner(data.is_owner);
        setUserRole({
            role_id: data.role_id,
            role_name: data.role_name,
        });
    } catch (err) {
        console.error('Error checking owner status:', err);
        setIsOwner(false);
    } finally {
        setCheckingOwner(false);
    }
}, [projectId, user]);
    // Cargar miembros del proyecto
    const loadMembers = useCallback(async () => {
        if (!projectId) 
            return;
        try {
            const data = await getProjectMembers(projectId);
            setMembers(data);
        } catch (err: any) {
            console.error('Error loading members:', err);
        }
    }, [projectId]);

    useEffect(() => {
        loadInvitations();
        loadMembers();
        checkOwnerStatus();
    }, [loadInvitations, loadMembers, checkOwnerStatus]);

    // Buscar usuarios para invitar
    const searchUsers = useCallback(async (
        attribute: 'name' | 'email',
        value: string
    ): Promise<UserSearchResult[]> => {
       
        if (!projectId) return [];
        
        try {
            return await searchUsersToInvite(projectId, attribute, value);
        } catch (err: any) {
            setError(err.message || 'Error al buscar usuarios');
            return [];
        }
    }, [projectId]);

    // Crear invitación (solo owner)
    const createInvitation = useCallback(async (
        email: string,
        projectRoleId: number
    ): Promise<Invitation> => {
        if (!projectId) throw new Error('Project ID required');
        
        if (!isOwner) {
            throw new Error('Solo el dueño del proyecto puede invitar colaboradores');
        }
        
        try {
            const newInvitation = await createProjectInvitation(projectId, {
                email,
                project_role_id: projectRoleId,
            });
            setInvitations(prev => [...prev, newInvitation]);
            return newInvitation;
        } catch (err: any) {
            setError(err.message || 'Error al crear invitación');
            throw err;
        }
    }, [projectId, isOwner]);

    // Cancelar invitación (solo owner)
    const cancelInvitation = useCallback(async (invitationId: number) => {
        if (!projectId) throw new Error('Project ID required');
        
        if (!isOwner) {
            throw new Error('Solo el dueño del proyecto puede cancelar invitaciones');
        }
        
        try {
            const updated = await updateInvitationStatus(projectId, invitationId, { status: 'cancelado' });
            setInvitations(prev => 
                prev.map(inv => inv.invitation_id === invitationId ? updated : inv)
            );
            return updated;
        } catch (err: any) {
            setError(err.message || 'Error al cancelar invitación');
            throw err;
        }
    }, [projectId, isOwner]);

    // Obtener invitaciones pendientes
    const pendingInvitations = invitations.filter(inv => inv.status === 'pendiente');

    return {
        invitations,
        pendingInvitations,
        members,
        loading,
        error,
        isOwner,
        checkingOwner,
        userRole,
        loadInvitations,
        loadMembers,
        searchUsers,
        createInvitation,
        cancelInvitation,
    };
};