#include <stdio.h>
#include <stdlib.h>

int main() {
    printf("Forcefully killing all Node.js processes...\n");
    
    // On Linux/Unix
    system("pkill -9 node");
    
    // On Windows (will be ignored on Linux)
    system("taskkill /F /IM node.exe");
    
    printf("All Node.js processes should be terminated.\n");
    return 0;
} 