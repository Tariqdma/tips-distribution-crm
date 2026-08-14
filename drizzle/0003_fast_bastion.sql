CREATE TABLE `crmDutyLocationPoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`latitude` varchar(32) NOT NULL,
	`longitude` varchar(32) NOT NULL,
	`accuracyMeters` int,
	`speedMetersPerSecond` varchar(32),
	`source` enum('foreground','background') NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crmDutyLocationPoints_id` PRIMARY KEY(`id`)
);
