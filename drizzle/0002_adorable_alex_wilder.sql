CREATE TABLE `crmCentralNotifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipientUserId` int,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`kind` enum('plan','visit','alert','team') NOT NULL,
	`createdByUserId` int NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crmCentralNotifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crmTeamInvites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`crmRole` enum('manager','sales_rep','medical_rep') NOT NULL,
	`territory` varchar(255) NOT NULL,
	`status` enum('pending','accepted','revoked') NOT NULL DEFAULT 'pending',
	`inviteCode` varchar(96) NOT NULL,
	`invitedByUserId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crmTeamInvites_id` PRIMARY KEY(`id`),
	CONSTRAINT `crmTeamInvites_inviteCode_unique` UNIQUE(`inviteCode`)
);
--> statement-breakpoint
CREATE TABLE `crmTerritoryBoundaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`territoryId` varchar(96) NOT NULL,
	`name` varchar(255) NOT NULL,
	`state` varchar(255) NOT NULL,
	`city` varchar(255) NOT NULL,
	`centerLatitude` varchar(32) NOT NULL,
	`centerLongitude` varchar(32) NOT NULL,
	`radiusMeters` int NOT NULL,
	`boundaryNotes` text,
	`updatedByUserId` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crmTerritoryBoundaries_id` PRIMARY KEY(`id`),
	CONSTRAINT `crmTerritoryBoundaries_territoryId_unique` UNIQUE(`territoryId`)
);
