import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MembershipRole, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ORGANIZATION_FIELDS = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
} as const;

function createSlugBase(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || `organization-${randomUUID().slice(0, 8)}`;
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, name: string) {
    const normalizedName = name.trim();
    const baseSlug = createSlugBase(normalizedName);

    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
        const existing = await this.prisma.organization.findUnique({
          where: { slug },
          select: { id: true },
        });
        if (existing) {
          continue;
        }

        try {
          return await this.prisma.$transaction(async (transaction) => {
            const organization = await transaction.organization.create({
              data: {
                name: normalizedName,
                slug,
              },
              select: ORGANIZATION_FIELDS,
            });
            const membership = await transaction.membership.create({
              data: {
                organizationId: organization.id,
                userId,
                role: MembershipRole.OWNER,
              },
              select: { role: true },
            });

            return {
              ...organization,
              role: membership.role,
            };
          });
        } catch (error) {
          if (isUniqueConflict(error)) {
            continue;
          }
          throw error;
        }
      }

      throw new ConflictException(
        'Unable to create an organization with that name',
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new ServiceUnavailableException('Organization unavailable');
    }
  }

  async listForUser(userId: string) {
    try {
      const memberships = await this.prisma.membership.findMany({
        where: { userId },
        orderBy: { organization: { name: 'asc' } },
        select: {
          role: true,
          organization: {
            select: ORGANIZATION_FIELDS,
          },
        },
      });
      return memberships.map(({ organization, role }) => ({
        ...organization,
        role,
      }));
    } catch {
      throw new ServiceUnavailableException('Organization unavailable');
    }
  }

  async getForUser(organizationId: string, userId: string) {
    try {
      const organization = await this.prisma.organization.findFirst({
        where: {
          id: organizationId,
          memberships: {
            some: { userId },
          },
        },
        select: {
          ...ORGANIZATION_FIELDS,
          memberships: {
            where: { userId },
            select: { role: true },
            take: 1,
          },
        },
      });
      if (!organization || organization.memberships.length === 0) {
        throw new NotFoundException('Organization not found');
      }

      const { memberships, ...safeOrganization } = organization;
      return {
        ...safeOrganization,
        role: memberships[0]!.role,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new ServiceUnavailableException('Organization unavailable');
    }
  }

  async listMembersForUser(organizationId: string, userId: string) {
    try {
      return await this.prisma.membership.findMany({
        where: {
          organizationId,
          organization: {
            memberships: {
              some: { userId },
            },
          },
        },
        orderBy: { user: { name: 'asc' } },
        select: {
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    } catch {
      throw new ServiceUnavailableException('Organization unavailable');
    }
  }
}
