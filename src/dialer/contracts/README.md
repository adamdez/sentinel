# dialer/contracts/ — Boundary Contracts

This folder contains the TypeScript interfaces that define the boundary between the dialer and other modules.

## Required contracts

### ContextSnapshot
The read-only data package the dialer receives from core/. Fields: owner name, property address, latest summary, distress flags, open tasks, prior call outcomes, important objections, preferred offer posture, known timeline/motivation, DNC/compliance flags.

### PublishToClientFile
The write contract for promoting confirmed dialer outputs into core/. Fields: call summary, extracted facts (operator-confirmed), objection tags, next action recommendation, disposition.

Both contracts must have TypeScript interfaces with tests. No dialer code should reach into core/ tables without going through these contracts.
