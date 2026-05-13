# DEXP Foundation Architecture

## Product Name

DEXP  
Dealer Execution Platform

## Core Rule

DEXP must be built as a modular dealership operations platform.

Each module must stay separate, but all modules may read from shared master data sources.

## Main Sources of Truth

### 1. Master RO Data

Firestore collection:

```text
ros