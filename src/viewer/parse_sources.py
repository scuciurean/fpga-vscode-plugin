import json
import os
import re
import sys

def parse_prjinfo(prjinfo_path):
    """Parse the .prjinfo file and build the module hierarchy."""
    if not os.path.exists(prjinfo_path):
        return {}

    with open(prjinfo_path, 'r') as f:
        prj_info = json.load(f)
    
    # Get the "sourceFiles" array from the .prjinfo file
    sources = prj_info.get('sourceFiles', [])
    module_definitions = {}  # {module_name: (module_ports, module_content)}

    # Step 1: Extract all module names and their definitions
    for source in sources:
        if source.endswith(('.v', '.vhdl', '.sv')):
            modules_in_file = extract_modules(source)
            for module_name, module_content in modules_in_file.items():
                module_definitions[module_name] = module_content

    # Step 2: Build the hierarchical structure, including nested submodules
    module_hierarchy = {}
    for module_name, (ports, content, filepath, line) in module_definitions.items():  # Unpack the tuple
        submodules = extract_instantiated_modules(content, list(module_definitions.keys()), module_definitions, filepath)
        module_hierarchy[module_name] = {
            'instance_name': module_name,
            'module_name': module_name,
            'ports': sanitize_ports(ports),
            'submodules': submodules,
            'path': [filepath, line]
        }

    return module_hierarchy

def extract_modules(filepath):
    """Extract modules and their content from a source file."""
    modules = {}
    if not os.path.exists(filepath):
        print(f"Warning: Source file {filepath} does not exist.")
        return modules

    with open(filepath, 'r') as f:
        content = f.read()

    # Remove all comments
    content = remove_comments(content)

    # Regex to capture module definitions
    # This regex captures from 'module [name](' to 'endmodule'
    module_regex = re.compile(r'\bmodule\s+(\w+)(?:\s*#\s*)?\s*\((.*?)([\s\S]*?)endmodule', re.DOTALL)
    param_regex = re.compile(r'\bmodule\s+(\w+)(?:)\s*#?\s*?\s*\(.*?\(*([\s\S]*?)\)[\s\S]*?\(([\s\S]*?)\);([\s\S]*?)endmodule',re.DOTALL)
    no_param_regex = re.compile(r'\bmodule\s+(\w+)(?:)\s*#?\s*?\s*\(.*?[\s\S]*?()([\s\S]*?)\);([\s\S]*?)endmodule', re.DOTALL)
   
    target  = re.search(r'\bmodule\s+(\w+(?:\s*#?\s*?\s*))\(', content)
    if target:
        if '#' in target.group(0):
            pattern = param_regex      
        else :
            pattern = no_param_regex

        matches = pattern.finditer(content)

        for match in matches:
            module_name = match.group(1)
            module_parameters = match.group(2)
            module_ports = match.group(3)
            module_content = match.group(4)
            line_number = content[:match.start()].count('\n') + 1  # Calculate line number
            modules[module_name] = (module_ports, module_content, filepath, line_number)

    return modules

def remove_comments(content):
    """Remove comments from the source code."""
    # Remove line comments (//) and block comments (/* */)
    content_no_comments = re.sub(r'//.*?$|/\*.*?\*/', '', content, flags=re.DOTALL | re.MULTILINE)
    return content_no_comments

def extract_instantiated_modules(module_content, all_module_names, module_definitions, filepath):
    """Recursively find submodule instantiations within a module's content."""
    instantiated_submodules = []

    # Find each module instantiation along with the instance name
    for submodule in all_module_names:
        # Regex to find instantiations: [submodule_name] [instance_name] (
        pattern = r'\b' + re.escape(submodule) + r'\s+(\w+)\s*\((.*?)\);'
        pattern_param =  re.compile(r'\b' + re.escape(submodule) + r'\s*?#?\s*?\(([\s\S]*?)\)\s*?(\w+)\s*?\(([\s\S]*?)\);', re.DOTALL)
        pattern_no_param =  re.compile(r'\b' + re.escape(submodule) + r'()\s*?(\w+)\s*?\(([\s\S]*?)\);', re.DOTALL)
        
        target = re.search(r'\b' + re.escape(submodule) + r'[\s\S]*?\(', module_content)
        if target:
            if '#' in target.group(0):
                pattern = pattern_param 
            else :
                pattern = pattern_no_param

            matches = pattern.finditer(module_content)
        
            for match in matches:
                parameters = match.group(1)
                instance_name = match.group(2)
                submodule_ports = match.group(3)
                submodule_content = module_definitions[submodule][1]  # Get the content of the submodule
                line_number = module_content[:match.start()].count('\n') + 1
                
                # Recursively find submodules inside the current submodule
                nested_submodules = extract_instantiated_modules(submodule_content, all_module_names, module_definitions, filepath)
                
                instantiated_submodules.append({
                    'instance_name': instance_name,
                    'module_name': submodule,
                    'ports': sanitize_ports(submodule_ports),
                    'submodules': nested_submodules,  # Add nested submodules 
                    'path': [filepath, line_number]  # Add file path and line number
                })

    return instantiated_submodules

def sanitize_ports(ports):
    """Sanitize the ports by removing comments, extra whitespace, and formatting into an array."""
    # Remove line comments (//) and block comments (/* */)
    ports_no_comments = re.sub(r'//.*?$|/\*.*?\*/', '', ports, flags=re.DOTALL | re.MULTILINE)
    
    # Split by commas and remove extra spaces/newlines
    ports_list = [port.strip() for port in ports_no_comments.split(',') if port.strip()]
    
    return ports_list

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({}))
        sys.exit(1)

    prjinfo_path = sys.argv[1]
    module_hierarchy = parse_prjinfo(prjinfo_path)
    print(json.dumps(module_hierarchy, indent=4))
