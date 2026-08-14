CREATE TABLE `crmProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`crmRole` enum('manager','sales_rep','medical_rep') NOT NULL DEFAULT 'sales_rep',
	`territory` varchar(255) NOT NULL DEFAULT 'غير معين',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crmProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `crmProfiles_userId_unique` UNIQUE(`userId`)
);
