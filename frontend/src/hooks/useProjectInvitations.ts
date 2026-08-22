import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    getProjectInvitations,
    searchUsersToInvite,
    createProjectInvitation,
    updateInvitationStatus,
    getProjectMembers,
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

    // Antes esto se pedía a GET /:projectId/user-role (endpoint
    // eliminado en el backend). Ahora sale directo de tu propia fila en
    // el listado de miembros — que YA incluye al owner como fila
    // sintética (project_member_id: null) y marca is_me — así que no
    // hace falta ningún pedido extra.
    const myMembership = useMemo(
        () => members.find((m) => m.is_me) ?? null,
        [members]
    );
    const isOwner = myMembership?.is_owner ?? false;
    const isAdmin = myMembership?.is_admin ?? false;
    const checkingOwner = membersLoading;

    // Compatibilidad: DashboardProjects.tsx muestra un badge simple con
    // "el rol del usuario en este proyecto" (userRole.role_name). Ya no
    // existe un único rol de proyecto, así que se arma una etiqueta
    // representativa: Owner/Administrador, o el primer rol de módulo que
    // tenga asignado.
    const userRole = useMemo(() => {
        if (!myMembership) return null;
        if (myMembership.is_owner) return { role_name: 'Owner' };
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

    // Invitar: ahora manda is_admin + module_roles en vez de un único
    // project_role_id (ese modelo ya no existe en el backend). Si
    // isAdminInvite es true, module_roles va vacío (400 si no).
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
    };
};