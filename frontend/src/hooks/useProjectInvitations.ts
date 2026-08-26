import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    getProjectInvitations,
    searchUsersToInvite,
    createProjectInvitation,
    updateInvitationStatus,
    getProjectMembers,
    setMemberAdmin,
    setMemberModuleRole,
    removeProjectMember,
} from '../services/invitation.service';
import {
    Invitation,
    UserSearchResult,
    ProjectMember,
    CreateInvitationRequest,
} from '../types/invitation.types';

export const useProjectInvitations = (projectId: number) => {
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [membersLoading, setMembersLoading] = useState(true);

    const loadInvitations = useCallback(async () => {
        if (!projectId) return;
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

    const loadMembers = useCallback(async () => {
        if (!projectId) return;
        setMembersLoading(true);
        try {
            const data = await getProjectMembers(projectId);
            setMembers(data);
        } catch (err: any) {
            console.error('Error loading members:', err);
        } finally {
            setMembersLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadInvitations();
        loadMembers();
    }, [loadInvitations, loadMembers]);

    
    const myMembership = useMemo(
        () => members.find((m) => m.is_me) ?? null,
        [members]
    );
    const isOwner = myMembership?.is_owner ?? false;
    const isAdmin = myMembership?.is_admin ?? false;
    const checkingOwner = membersLoading;

  
    const userRole = useMemo(() => {
        if (!myMembership) return null;
        if (myMembership.is_owner) return { role_name: 'Propietario' };
        if (myMembership.is_admin) return { role_name: 'Administrador' };
        const first = myMembership.module_roles[0];
        return { role_name: first ? first.role_name : 'Miembro' };
    }, [myMembership]);

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


    const createInvitation = useCallback(async (
        email: string,
        isAdminInvite: boolean,
        moduleRoles: { module_code: string; module_role_id: number }[]
    ): Promise<Invitation> => {
        if (!projectId) throw new Error('Project ID required');
        if (!isOwner && !isAdmin) {
            throw new Error('Solo el dueño o un administrador del proyecto puede invitar colaboradores');
        }
        try {
            const body: CreateInvitationRequest = {
                email,
                is_admin: isAdminInvite,
                module_roles: isAdminInvite ? [] : moduleRoles,
            };
            const newInvitation = await createProjectInvitation(projectId, body);
            setInvitations(prev => [...prev, newInvitation]);
            return newInvitation;
        } catch (err: any) {
            setError(err.message || 'Error al crear invitación');
            throw err;
        }
    }, [projectId, isOwner, isAdmin]);

    const cancelInvitation = useCallback(async (invitationId: number) => {
        if (!projectId) throw new Error('Project ID required');
        if (!isOwner && !isAdmin) {
            throw new Error('Solo el dueño o un administrador del proyecto puede cancelar invitaciones');
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
    }, [projectId, isOwner, isAdmin]);

    const pendingInvitations = invitations.filter(inv => inv.status === 'pendiente');

    // memberId acá es project_member_id (no user_id) — así lo pide el
    // backend en /members/:memberId/admin y /members/:memberId/modules/...
    const updateMemberAdmin = useCallback(async (memberId: number, isAdminValue: boolean) => {
        if (!projectId) throw new Error('Project ID required');
        if (!isOwner && !isAdmin) {
            throw new Error('Solo el dueño o un administrador del proyecto puede cambiar roles');
        }
        await setMemberAdmin(projectId, memberId, isAdminValue);
        await loadMembers();
    }, [projectId, isOwner, isAdmin, loadMembers]);

    const updateMemberModuleRole = useCallback(async (
        memberId: number, moduleCode: string, moduleRoleId: number
    ) => {
        if (!projectId) throw new Error('Project ID required');
        if (!isOwner && !isAdmin) {
            throw new Error('Solo el dueño o un administrador del proyecto puede cambiar roles');
        }
        await setMemberModuleRole(projectId, memberId, moduleCode, moduleRoleId);
        await loadMembers();
    }, [projectId, isOwner, isAdmin, loadMembers]);

    // Acá sí es user_id (no project_member_id) — así lo pide el backend
    // en DELETE /members/:userId.
    const removeMember = useCallback(async (userId: number) => {
        if (!projectId) throw new Error('Project ID required');
        if (!isOwner && !isAdmin) {
            throw new Error('Solo el dueño o un administrador del proyecto puede eliminar miembros');
        }
        await removeProjectMember(projectId, userId);
        await loadMembers();
    }, [projectId, isOwner, isAdmin, loadMembers]);

    return {
        invitations,
        pendingInvitations,
        members,
        loading,
        error,
        isOwner,
        isAdmin,
        checkingOwner,
        userRole,
        loadInvitations,
        loadMembers,
        searchUsers,
        createInvitation,
        cancelInvitation,
        updateMemberAdmin,
        updateMemberModuleRole,
        removeMember,
    };
};